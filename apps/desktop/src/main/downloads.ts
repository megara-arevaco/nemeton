import { readTextIfExists, withFileLock, writeJsonAtomically } from "@launcher/core";
import { safeStorage } from "electron";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Torrent } from "webtorrent";
import {
  startDownloadSchema,
  type DownloadJob,
  type DownloadStatus,
  type DownloadsSnapshot,
  type DownloadAction,
  type DownloadFileAction,
  type StartDownloadInput,
} from "../shared/downloads.js";
import { fetchTorrentMetadata, RealDebrid } from "./download-network.js";
import {
  downloadHttpFile,
  TransferSlots,
  type StoredDownloadFile,
} from "./download-http.js";

interface StoredJob extends Omit<DownloadJob, "files"> {
  files: StoredDownloadFile[];
}

interface DownloadState {
  jobs: StoredJob[];
  directory: string | null;
  encryptedToken: string | null;
  account: DownloadsSnapshot["account"];
  sources?: unknown;
}

interface ActiveTask {
  controller: AbortController;
  done: Promise<void>;
}

const runningStatuses: DownloadStatus[] = ["queued", "preparing", "downloading"];
const maxConcurrent = 3;

function makeFile(id: string, name: string, total: number): StoredDownloadFile {
  return {
    id,
    name,
    total,
    bytes: 0,
    speed: 0,
    progress: 0,
    selected: true,
    status: "queued",
    error: null,
  };
}

export class DownloadManager {
  private state: DownloadState = {
    jobs: [],
    directory: null,
    encryptedToken: null,
    account: null,
  };
  private token: string | null = null;
  private active = new Map<string, ActiveTask>();
  private transfers = new Map<string, ActiveTask>();
  private torrents = new Map<string, { torrent: Torrent; update: () => void }>();
  private slots = new TransferSlots(3);
  private stopping = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly file: string;
  private readonly torrentDirectory: string;

  constructor(dataDirectory: string) {
    this.file = path.join(dataDirectory, "downloads.json");
    this.torrentDirectory = path.join(dataDirectory, "download-torrents");
  }

  async initialize() {
    const raw = await readTextIfExists(this.file);

    if (raw) {
      this.state = JSON.parse(raw) as DownloadState;
    }
    for (const job of this.state.jobs) {
      job.files ??= [];
      job.selectionConfirmed ??= job.files.length > 0;
      job.cloudProgress ??= 0;
      if ([...runningStatuses, "interrupted"].includes(job.status)) {
        job.status = "paused";
      }
      job.speed = 0;
      job.peers = 0;
      for (const file of job.files) {
        if ([...runningStatuses, "interrupted"].includes(file.status)) {
          file.status = "paused";
        }
        file.speed = 0;
      }
    }
    if (this.state.encryptedToken && this.canEncrypt()) {
      try {
        this.token = safeStorage.decryptString(
          Buffer.from(this.state.encryptedToken, "base64"),
        );
      } catch {
        this.token = null;
      }
    }
    await this.persist();
    this.timer = setInterval(() => {
      if (this.active.size) {
        void this.persist().catch(() => undefined);
      }
    }, 1000);
    this.timer.unref();
  }

  private canEncrypt() {
    return (
      safeStorage.isEncryptionAvailable() &&
      (process.platform !== "linux" ||
        safeStorage.getSelectedStorageBackend() !== "basic_text")
    );
  }

  private persist() {
    return writeJsonAtomically(this.file, this.state);
  }

  snapshot(): DownloadsSnapshot {
    return {
      jobs: this.state.jobs.map((job) => {
        this.aggregate(job);
        return {
          ...job,
          files: job.files.map(
            ({ link: _link, etag: _etag, modified: _modified, ...file }) => ({
              ...file,
            }),
          ),
        };
      }),
      directory: this.state.directory,
      account: this.token ? this.state.account : null,
      hasToken: Boolean(this.token),
      persistentToken: Boolean(this.state.encryptedToken && this.token),
      maxConcurrent,
    };
  }

  async connect(token: string) {
    const account = await new RealDebrid(token).account();
    this.token = token;
    this.state.account = account;
    this.state.encryptedToken = this.canEncrypt()
      ? safeStorage.encryptString(token).toString("base64")
      : null;
    await this.persist();
    return this.snapshot();
  }

  async disconnect() {
    if ([...this.active.keys()].some((id) => this.job(id).method === "real-debrid")) {
      throw new Error("active-real-debrid");
    }
    this.token = null;
    this.state.account = null;
    this.state.encryptedToken = null;
    await this.persist();
    return this.snapshot();
  }

  async setDirectory(directory: string) {
    this.state.directory = directory;
    await this.persist();
    return this.snapshot();
  }

  async importTorrent(filePath: string) {
    const info = await fs.stat(filePath);

    if (!info.isFile() || info.size > 8 * 1024 * 1024) {
      throw new Error("invalid-torrent");
    }

    const buffer = await fs.readFile(filePath);

    if (!buffer.length || buffer.length > 8 * 1024 * 1024 || buffer[0] !== 100) {
      throw new Error("invalid-torrent");
    }

    const id = randomUUID();
    await fs.mkdir(this.torrentDirectory, { recursive: true });
    await fs.writeFile(path.join(this.torrentDirectory, `${id}.torrent`), buffer, {
      flag: "wx",
      mode: 0o600,
    });
    return { id, name: path.basename(filePath) };
  }

  private async metainfo(job: StoredJob, signal: AbortSignal) {
    if (job.torrentFileId) {
      const info = await fs.stat(
        path.join(this.torrentDirectory, `${job.torrentFileId}.torrent`),
      );

      if (!info.isFile() || info.size > 8 * 1024 * 1024) {
        throw new Error("invalid-torrent");
      }
      return fs.readFile(
        path.join(this.torrentDirectory, `${job.torrentFileId}.torrent`),
      );
    }
    return fetchTorrentMetadata(job.uri, signal);
  }

  async start(input: StartDownloadInput) {
    const parsed = startDownloadSchema.parse(input);

    if (!this.state.directory) {
      throw new Error("choose-folder");
    }
    if (parsed.method === "real-debrid" && !this.token) {
      throw new Error("connect-real-debrid");
    }
    if (this.state.jobs.length >= 500) {
      throw new Error("history-full");
    }
    if (
      this.state.jobs.some(
        (job) =>
          ((parsed.uri && job.uri === parsed.uri) ||
            (parsed.torrentFileId && job.torrentFileId === parsed.torrentFileId)) &&
          !["completed", "cancelled", "error"].includes(job.status),
      )
    ) {
      throw new Error("already-queued");
    }
    if (parsed.torrentFileId) {
      await this.metainfo(
        { torrentFileId: parsed.torrentFileId } as StoredJob,
        new AbortController().signal,
      );
    }

    const id = randomUUID();
    const job: StoredJob = {
      ...parsed,
      uri: parsed.uri ?? "",
      id,
      status: "queued",
      directory: path.join(this.state.directory, `nemeton-${id}`),
      bytes: 0,
      total: 0,
      speed: 0,
      progress: 0,
      cloudProgress: 0,
      peers: 0,
      error: null,
      createdAt: new Date().toISOString(),
      files: [],
      selectionConfirmed: false,
    };
    this.state.jobs.unshift(job);
    await this.persist();
    this.pump();
    return this.snapshot();
  }

  private job(id: string) {
    const job = this.state.jobs.find((item) => item.id === id);

    if (!job) {
      throw new Error("download-not-found");
    }
    return job;
  }

  async select(id: string, fileIds: string[]) {
    return withFileLock(`${this.file}:${id}`, async () => {
      const job = this.job(id);

      if (
        job.status !== "waiting-selection" ||
        !fileIds.length ||
        fileIds.some((id) => !job.files.some((file) => file.id === id))
      ) {
        throw new Error("invalid-selection");
      }
      for (const file of job.files) {
        file.selected = fileIds.includes(file.id);
        file.status = file.selected ? "queued" : "cancelled";
      }
      job.selectionConfirmed = true;
      job.status = "queued";
      await this.persist();
      this.pump();
      return this.snapshot();
    });
  }

  async control(id: string, action: DownloadAction) {
    return withFileLock(`${this.file}:${id}`, async () => {
      const job = this.job(id);

      if (action === "pause" || action === "cancel") {
        if (job.status === "completed") {
          return this.snapshot();
        }
        job.status = action === "pause" ? "paused" : "cancelled";
        for (const file of job.files) {
          if (
            file.selected &&
            file.status !== "completed" &&
            (action === "cancel" || runningStatuses.includes(file.status))
          ) {
            file.status = job.status;
            file.speed = 0;
          }
        }

        const active = this.active.get(id);
        active?.controller.abort(job.status);
        await active?.done;
      } else if (action === "remove") {
        if (this.active.has(id) || runningStatuses.includes(job.status)) {
          throw new Error("pause-before-remove");
        }
        this.state.jobs = this.state.jobs.filter((item) => item.id !== id);
      } else {
        if (
          this.active.has(id) ||
          job.status === "waiting-selection" ||
          job.status === "completed"
        ) {
          return this.snapshot();
        }
        if (job.method === "real-debrid" && !this.token) {
          throw new Error("connect-real-debrid");
        }
        for (const file of job.files) {
          if (file.selected && file.status !== "completed") {
            file.status = "queued";
            file.error = null;
          }
        }
        job.error = null;
        job.status = "queued";
      }
      await this.persist();
      this.pump();
      return this.snapshot();
    });
  }

  async controlFile(id: string, fileId: string, action: DownloadFileAction) {
    return withFileLock(`${this.file}:${id}`, async () => {
      const job = this.job(id);
      const file = job.files.find((item) => item.id === fileId);

      if (!file || !file.selected || !job.selectionConfirmed) {
        throw new Error("invalid-selection");
      }
      if (file.status === "completed") {
        return this.snapshot();
      }
      if (action === "resume") {
        if (job.method === "real-debrid" && !this.token) {
          throw new Error("connect-real-debrid");
        }
        file.status = "queued";
        file.error = null;
        if (!this.active.has(id) || !runningStatuses.includes(job.status)) {
          job.status = "queued";
          job.error = null;
        }
      } else {
        file.status = action === "pause" ? "paused" : "cancelled";
        file.speed = 0;
        const transfer = this.transfers.get(`${id}:${fileId}`);
        transfer?.controller.abort(file.status);
        await transfer?.done;
      }
      this.torrents.get(id)?.update();
      if (
        action !== "resume" &&
        !job.files.some(
          (file) => file.selected && runningStatuses.includes(file.status),
        )
      ) {
        this.settle(job);
        const active = this.active.get(id);
        active?.controller.abort(job.status);
        await active?.done;
      }
      await this.persist();
      this.pump();
      return this.snapshot();
    });
  }

  directoryFor(id: string) {
    return this.job(id).directory;
  }

  async stop() {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const [id, active] of this.active) {
      const job = this.job(id);
      job.status = "paused";
      for (const file of job.files) {
        if (runningStatuses.includes(file.status)) {
          file.status = "paused";
        }
      }
      active.controller.abort("paused");
    }
    await Promise.all([...this.active.values()].map((active) => active.done));
    await this.persist();
  }

  private aggregate(job: StoredJob) {
    if (!job.files.length) {
      return;
    }

    const files = job.files.filter(
      (file) => file.selected && file.status !== "cancelled",
    );
    job.bytes = files.reduce((sum, file) => sum + file.bytes, 0);
    job.total = files.reduce((sum, file) => sum + file.total, 0);
    job.speed = files.reduce((sum, file) => sum + file.speed, 0);
    job.progress = job.total
      ? (job.bytes / job.total) * 100
      : job.status === "completed"
        ? 100
        : 0;
  }

  private settle(job: StoredJob) {
    const files = job.files.filter((file) => file.selected);

    if (!job.selectionConfirmed) {
      job.status = "waiting-selection";
      return;
    }
    if (files.some((file) => file.status === "queued")) {
      job.status = "queued";
    } else if (files.some((file) => file.status === "error")) {
      job.status = "error";
    } else if (files.some((file) => file.status === "paused")) {
      job.status = "paused";
    } else if (files.length && files.every((file) => file.status === "cancelled")) {
      job.status = "cancelled";
    } else {
      job.status = "completed";
    }
    this.aggregate(job);
  }

  private pump() {
    if (this.stopping) {
      return;
    }
    for (const job of [...this.state.jobs].reverse()) {
      if (this.active.size >= maxConcurrent) {
        break;
      }
      if (job.status !== "queued" || this.active.has(job.id)) {
        continue;
      }

      const controller = new AbortController();
      job.status = "preparing";
      const task: ActiveTask = { controller, done: Promise.resolve() };
      this.active.set(job.id, task);
      task.done = this.run(job, controller.signal)
        .then(() => {
          if (!controller.signal.aborted && job.status !== "waiting-selection") {
            this.settle(job);
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            job.status = "error";
            job.error = errorCode(error);
          }
        })
        .finally(async () => {
          job.speed = 0;
          job.peers = 0;
          for (const file of job.files) {
            file.speed = 0;
          }
          try {
            await this.persist();
          } catch {
            job.status = "error";
            job.error = "save-failed";
          }
          this.active.delete(job.id);
          this.pump();
        });
    }
  }

  private async run(job: StoredJob, signal: AbortSignal) {
    await fs.mkdir(job.directory, { recursive: true });
    signal.throwIfAborted();
    if (job.method === "torrent") {
      return this.runTorrent(job, signal);
    }
    if (!this.token) {
      throw new Error("connect-real-debrid");
    }

    const rd = new RealDebrid(this.token);
    const isTorrent =
      Boolean(job.torrentFileId) ||
      job.uri.startsWith("magnet:") ||
      new URL(job.uri).pathname.toLowerCase().endsWith(".torrent");

    if (isTorrent) {
      if (!job.torrentId) {
        job.torrentId = job.uri.startsWith("magnet:")
          ? await rd.addMagnet(job.uri, signal)
          : await rd.addTorrent(await this.metainfo(job, signal), signal);
        await this.persist();
      }
      while (true) {
        signal.throwIfAborted();
        const info = await rd.info(job.torrentId, signal);
        job.cloudProgress = info.progress;
        if (["magnet_error", "error", "virus", "dead"].includes(info.status)) {
          throw new Error("remote-torrent-failed");
        }
        if (!job.files.length && info.files.length) {
          job.files = info.files.map((file) =>
            makeFile(String(file.id), file.path, file.bytes),
          );
          job.selectionConfirmed = job.files.length === 1;
        }
        if (job.files.length && !job.selectionConfirmed) {
          job.status = "waiting-selection";
          return;
        }
        if (info.status === "waiting_files_selection" && job.selectionConfirmed) {
          await rd.select(
            job.torrentId,
            job.files.filter((file) => file.selected).map((file) => file.id),
            signal,
          );
        }
        if (info.status === "downloaded") {
          const selected = info.files.filter((file) => file.selected === 1);

          if (selected.length !== info.links.length || !selected.length) {
            throw new Error("invalid-file-links");
          }
          for (const file of job.files.filter((file) => file.selected)) {
            const index = selected.findIndex((remote) => String(remote.id) === file.id);

            if (index < 0) {
              throw new Error("invalid-file-links");
            }
            file.link = info.links[index];
          }
          break;
        }
        await delay(3000, undefined, { signal });
      }
    } else if (!job.files.length) {
      const info = await rd.unrestrict(job.uri, signal);
      job.files = [{ ...makeFile("1", info.filename, info.filesize), link: job.uri }];
      job.selectionConfirmed = true;
    }
    job.status = "downloading";
    while (true) {
      signal.throwIfAborted();
      for (const file of job.files.filter(
        (file) =>
          file.selected &&
          file.status === "queued" &&
          !this.transfers.has(`${job.id}:${file.id}`),
      )) {
        void this.runHttp(job, file, rd, signal);
      }

      const active = [...this.transfers]
        .filter(([key]) => key.startsWith(`${job.id}:`))
        .map(([, task]) => task.done);

      if (!active.length) {
        break;
      }
      await Promise.race([...active, delay(100, undefined, { signal })]);
    }
  }

  private async runHttp(
    job: StoredJob,
    file: StoredDownloadFile,
    rd: RealDebrid,
    signal: AbortSignal,
  ) {
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal]);
    const key = `${job.id}:${file.id}`;
    const task: ActiveTask = { controller, done: Promise.resolve() };
    this.transfers.set(key, task);
    task.done = this.slots
      .use(combined, async () => {
        await downloadHttpFile(
          file,
          job.directory,
          () => rd.unrestrict(file.link ?? job.uri, combined),
          combined,
        );
      })
      .catch((error: unknown) => {
        if (combined.aborted) {
          if (file.status !== "completed") {
            file.status = combined.reason === "cancelled" ? "cancelled" : "paused";
          }
        } else {
          file.status = "error";
          file.error = errorCode(error);
        }
      })
      .finally(() => {
        file.speed = 0;
        this.transfers.delete(key);
        this.aggregate(job);
      });
    await task.done;
  }

  private async runTorrent(job: StoredJob, signal: AbortSignal) {
    const { default: WebTorrent } = await import("webtorrent");
    signal.throwIfAborted();
    const client = new WebTorrent({
      natUpnp: false,
      natPmp: false,
      lsd: false,
      utp: false,
    });
    let fail: (error: Error) => void = () => undefined;
    client.on("error", (error) =>
      fail(error instanceof Error ? error : new Error(String(error))),
    );
    try {
      const input =
        job.torrentFileId || !job.uri.startsWith("magnet:")
          ? await this.metainfo(job, signal)
          : job.uri;
      signal.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const torrent = client.add(input, { path: job.directory, deselect: true });
        let finished = false;
        let timer: ReturnType<typeof setInterval> | null = null;
        const finish = (error?: Error) => {
          if (finished) {
            return;
          }
          finished = true;
          if (timer) {
            clearInterval(timer);
          }
          signal.removeEventListener("abort", abort);
          this.torrents.delete(job.id);
          torrent.destroy({ destroyStore: false }, () =>
            error ? reject(error) : resolve(),
          );
        };
        fail = finish;
        const abort = () => finish(new Error("stopped"));
        const update = () => {
          if (finished || !torrent.ready) {
            return;
          }
          job.peers = torrent.numPeers;
          for (const [index, remote] of torrent.files.entries()) {
            const file = job.files.find((file) => file.id === String(index + 1));

            if (!file) {
              continue;
            }
            file.bytes = remote.done
              ? remote.length
              : Math.max(0, Math.min(remote.length, remote.downloaded));
            file.progress = remote.length ? (file.bytes / remote.length) * 100 : 100;
            const shouldDownload =
              file.selected && ["queued", "downloading"].includes(file.status);

            if (shouldDownload && remote.done) {
              file.status = "completed";
              file.speed = 0;
            } else if (shouldDownload) {
              file.status = "downloading";
              file.speed =
                torrent.downloadSpeed /
                Math.max(
                  1,
                  job.files.filter((file) => file.status === "downloading").length,
                );
            } else {
              file.speed = 0;
            }
          }
          this.aggregate(job);
          if (
            job.selectionConfirmed &&
            !job.files.some(
              (file) =>
                file.selected && ["queued", "downloading"].includes(file.status),
            )
          ) {
            finish();
          }
        };
        const select = () => {
          for (const remote of torrent.files) {
            remote.deselect();
          }
          for (const [index, remote] of torrent.files.entries()) {
            const file = job.files.find((file) => file.id === String(index + 1));

            if (file?.selected && ["queued", "downloading"].includes(file.status)) {
              remote.select();
            }
          }
          update();
        };
        torrent.once("ready", () => {
          if (finished) {
            return;
          }
          if (!job.files.length) {
            job.files = torrent.files.map((file, index) =>
              makeFile(String(index + 1), file.path, file.length),
            );
            job.selectionConfirmed = job.files.length === 1;
          }
          if (!job.selectionConfirmed) {
            job.status = "waiting-selection";
            finish();
            return;
          }
          job.status = "downloading";
          this.torrents.set(job.id, { torrent, update: select });
          select();
          if (!finished) {
            timer = setInterval(update, 200);
          }
        });
        torrent.on("download", update);
        torrent.once("done", update);
        torrent.once("error", (error) =>
          finish(error instanceof Error ? error : new Error(error)),
        );
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) {
          abort();
        }
      });
    } finally {
      if (!client.destroyed) {
        await new Promise<void>((resolve) => client.destroy(() => resolve()));
      }
    }
  }
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "download-failed";
  return /^[a-z][a-z0-9-]{0,80}$/.test(message) ? message : "download-failed";
}
