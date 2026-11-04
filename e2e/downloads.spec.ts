import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import type { ElectronApplication, Page } from "@playwright/test";
import { test, expect, launchIsolatedDesktop } from "./fixtures";

async function setupRealDebrid(
  app: ElectronApplication,
  folder: string,
  options: {
    size?: number;
    delay?: number;
    rangeMode?: string;
    bundle?: boolean;
    validators?: boolean;
  } = {},
) {
  await fs.mkdir(folder, { recursive: true });
  await app.evaluate(
    ({ dialog, net }, { folder, options }) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
      const state = {
        size: options.size ?? 5,
        delay: options.delay ?? 0,
        rangeMode: options.rangeMode ?? "normal",
        bundle: options.bundle ?? false,
        validators: options.validators ?? true,
        selected: [] as string[],
        uploaded: false,
        active: 0,
        maxActive: 0,
        requests: [] as {
          path: string;
          range: string | null;
          ifRange: string | null;
        }[],
        generation: 0,
      };
      Reflect.set(globalThis, "downloadFixture", state);
      const fixtureFetch: typeof globalThis.fetch = async (input, init) => {
        const url = new URL(String(input));
        const json = (data: unknown) => new Response(JSON.stringify(data));

        if (url.pathname.endsWith("/user")) {
          return json({
            username: "fixture-user",
            type: "premium",
            expiration: "2027-01-01",
          });
        }
        if (url.pathname.endsWith("/torrents/addMagnet")) {
          return json({ id: "fixture-torrent" });
        }
        if (url.pathname.endsWith("/torrents/addTorrent")) {
          if (
            init?.method !== "PUT" ||
            !(init.body instanceof Blob) ||
            !init.body.size
          ) {
            throw new Error("bad-upload");
          }
          state.uploaded = true;
          return json({ id: "fixture-torrent" });
        }
        if (url.pathname.endsWith("/torrents/selectFiles/fixture-torrent")) {
          state.selected = new URLSearchParams(String(init?.body))
            .get("files")!
            .split(",");
          return new Response(null, { status: 204 });
        }
        if (url.pathname.endsWith("/torrents/info/fixture-torrent")) {
          return json({
            id: "fixture-torrent",
            status: state.selected.length ? "downloaded" : "waiting_files_selection",
            progress: state.selected.length ? 100 : 0,
            bytes: state.size * 2,
            files: ["alpha", "beta"].map((name, index) => ({
              id: index + 1,
              path: `folder/${name}.bin`,
              bytes: state.size,
              selected: state.selected.includes(String(index + 1)) ? 1 : 0,
            })),
            links:
              state.bundle && state.selected.length
                ? ["https://host.example/bundle"]
                : state.selected.map(
                    (id) => `https://host.example/${id === "1" ? "alpha" : "beta"}`,
                  ),
          });
        }
        if (url.pathname.endsWith("/unrestrict/link")) {
          const link = new URL(new URLSearchParams(String(init?.body)).get("link")!);
          const name = link.pathname.split("/").pop()!;
          return json({
            filename: `${name}.bin`,
            filesize: state.size,
            download: `https://files.example/${name}?generation=${++state.generation}`,
          });
        }
        if (url.hostname === "files.example") {
          const headers = new Headers(init?.headers);
          const range = headers.get("range");
          state.requests.push({
            path: url.pathname,
            range,
            ifRange: headers.get("if-range"),
          });
          const requested = range ? Number(/^bytes=(\d+)-$/.exec(range)![1]) : 0;
          const offset = state.rangeMode === "ignore" ? 0 : requested;
          let cursor = offset;
          let ended = false;
          state.active++;
          state.maxActive = Math.max(state.maxActive, state.active);
          const finish = () => {
            if (!ended) {
              ended = true;
              state.active--;
            }
          };
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  if (!ended) {
                    finish();
                    controller.error(new Error("aborted"));
                  }
                },
                { once: true },
              );
            },
            async pull(controller) {
              if (state.delay) {
                await new Promise((resolve) => setTimeout(resolve, state.delay));
              }
              if (ended) {
                return;
              }
              if (cursor >= state.size) {
                finish();
                controller.close();
                return;
              }

              const bytes = Buffer.alloc(
                Math.min(16384, state.size - cursor),
                (url.pathname.charCodeAt(1) || 65) +
                  (range && state.rangeMode === "corrupt" ? 1 : 0),
              );
              cursor += bytes.length;
              controller.enqueue(bytes);
            },
            cancel() {
              finish();
            },
          });
          const responseHeaders: Record<string, string> = {
            "Content-Length": String(state.size - offset),
            ...(state.validators
              ? { ETag: state.rangeMode === "changed" ? '"changed"' : '"fixture-v1"' }
              : {}),
            "Accept-Ranges": "bytes",
          };

          if (range && state.rangeMode !== "ignore") {
            responseHeaders["Content-Range"] =
              `bytes ${offset + (state.rangeMode === "bad" ? 1 : 0)}-${state.size - 1}/${state.size}`;
          }
          return new Response(body, {
            status: range && state.rangeMode !== "ignore" ? 206 : 200,
            headers: responseHeaders,
          });
        }
        throw new Error(`Unexpected request: ${url.hostname}${url.pathname}`);
      };
      globalThis.fetch = fixtureFetch;
      net.fetch = fixtureFetch;
    },
    { folder, options },
  );
}

async function connect(page: Page) {
  await page.evaluate(async () => {
    await window.launcher.chooseDownloadDirectory();
    await window.launcher.connectRealDebrid("fixture_token");
  });
}

async function state(page: Page) {
  return page.evaluate(() => window.launcher.getDownloads());
}

async function waitBytes(page: Page, id: string, fileId = "1") {
  await expect
    .poll(
      async () =>
        (await state(page)).jobs
          .find((job) => job.id === id)
          ?.files.find((file) => file.id === fileId)?.bytes ?? 0,
    )
    .toBeGreaterThan(0);
}

function digest(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

test("link-only UI saves configuration, downloads and shows one progress bar per game", async ({
  desktop,
}, testInfo) => {
  const { page, directory } = desktop;
  await setupRealDebrid(desktop.app, path.join(directory, "downloads"));
  await page.getByRole("button", { name: "Descargas", exact: true }).click();
  await expect(page.getByRole("button", { name: "Fuentes", exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("navigation", { name: "Descargas", exact: true })
    .getByRole("button", { name: "Configuración", exact: true })
    .click();
  await page.getByRole("button", { name: "Elegir carpeta", exact: true }).click();
  await page.getByLabel("Clave API de Real-Debrid").fill("fixture_token");
  await page.getByRole("button", { name: "Conectar cuenta", exact: true }).click();
  await expect(page.getByText(/Conectado como fixture-user/)).toBeVisible();
  await page.getByRole("button", { name: "Cola de descargas", exact: true }).click();
  await page
    .getByLabel("Enlaces magnet o HTTPS · uno por línea")
    .fill("https://host.example/first\nhttps://host.example/second");
  await page.getByRole("button", { name: "Añadir a la cola", exact: true }).click();
  await expect(page.getByText("Completada", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("progressbar")).toHaveCount(2);
  await expect(
    page.getByLabel("Enlaces magnet o HTTPS · uno por línea"),
  ).not.toBeVisible();
  await expect(page.getByRole("progressbar").first()).toBeInViewport();
  const snapshot = await state(page);
  expect(snapshot.jobs).toHaveLength(2);
  for (const job of snapshot.jobs) {
    expect(path.basename(job.directory)).toBe(job.title);
    expect(await fs.readFile(path.join(job.directory, `1-${job.title}.bin`))).toEqual(
      Buffer.alloc(5, job.title.charCodeAt(0)),
    );
  }
  expect(
    await fs.readFile(path.join(directory, "data", "downloads.json"), "utf8"),
  ).not.toContain("fixture_token");
  await page.screenshot({ path: testInfo.outputPath("downloads-desktop.png") });
  await page.setViewportSize({ width: 980, height: 640 });
  await page.screenshot({ path: testInfo.outputPath("downloads-compact.png") });
  const restarted = await desktop.restart();
  expect((await state(restarted)).jobs.every((job) => job.status === "completed")).toBe(
    true,
  );
});

test("three HTTPS tasks run concurrently and file pause resumes the exact saved range", async ({
  desktop,
}) => {
  const { page, directory } = desktop;
  const size = 4 * 1024 * 1024;
  await setupRealDebrid(desktop.app, path.join(directory, "downloads"), {
    size,
    delay: 15,
  });
  await connect(page);
  const ids = await page.evaluate(async () => {
    const ids: string[] = [];

    for (const title of ["alpha", "beta", "gamma"]) {
      const snapshot = await window.launcher.startDownload({
        title,
        uri: `https://host.example/${title}`,
        method: "real-debrid",
      });
      ids.push(snapshot.jobs[0].id);
    }
    return ids;
  });
  await Promise.all(ids.map((id) => waitBytes(page, id)));
  expect(
    await desktop.app.evaluate(
      () => Reflect.get(globalThis, "downloadFixture").maxActive,
    ),
  ).toBe(3);
  await page.evaluate(
    (id) => window.launcher.controlDownloadFile(id, "1", "pause"),
    ids[0],
  );
  const paused = (await state(page)).jobs.find((job) => job.id === ids[0])!;
  const partial = path.join(paused.directory, "1-alpha.bin.partial");
  const bytes = (await fs.stat(partial)).size;
  expect(bytes).toBeGreaterThan(0);
  expect(bytes).toBeLessThan(size);
  await expect
    .poll(async () => (await state(page)).jobs.find((job) => job.id === ids[1])!.bytes)
    .toBeGreaterThan(paused.bytes);
  expect((await fs.stat(partial)).size).toBe(bytes);
  await page.evaluate(
    (id) => window.launcher.controlDownloadFile(id, "1", "resume"),
    ids[0],
  );
  await expect
    .poll(
      async () => (await state(page)).jobs.every((job) => job.status === "completed"),
      { timeout: 20_000 },
    )
    .toBe(true);
  const requests = await desktop.app.evaluate(
    () => Reflect.get(globalThis, "downloadFixture").requests,
  );
  expect(requests).toContainEqual({
    path: "/alpha",
    range: `bytes=${bytes}-`,
    ifRange: '"fixture-v1"',
  });
  expect(digest(await fs.readFile(path.join(paused.directory, "1-alpha.bin")))).toBe(
    digest(Buffer.alloc(size, 97)),
  );
});

test("task pause survives restart, resumes partial data and cancellation preserves it", async ({
  desktop,
}) => {
  const size = 2 * 1024 * 1024;
  const folder = path.join(desktop.directory, "downloads");
  await setupRealDebrid(desktop.app, folder, { size, delay: 15 });
  await connect(desktop.page);
  const added = await desktop.page.evaluate(() =>
    window.launcher.startDownload({
      title: "persistent",
      uri: "https://host.example/persistent",
      method: "real-debrid",
    }),
  );
  const id = added.jobs[0].id;
  await waitBytes(desktop.page, id);
  await desktop.page.evaluate((id) => window.launcher.controlDownload(id, "pause"), id);
  const partial = path.join(added.jobs[0].directory, "1-persistent.bin.partial");
  const pausedBytes = (await fs.stat(partial)).size;
  const page = await desktop.restart();
  expect((await state(page)).jobs[0].status).toBe("paused");
  expect((await fs.stat(partial)).size).toBe(pausedBytes);
  await setupRealDebrid(desktop.app, folder, { size, delay: 15 });
  await page.evaluate(() => window.launcher.connectRealDebrid("fixture_token"));
  await page.evaluate((id) => window.launcher.controlDownload(id, "resume"), id);
  await expect
    .poll(async () => (await state(page)).jobs[0].bytes)
    .toBeGreaterThan(pausedBytes);
  await page.evaluate((id) => window.launcher.controlDownload(id, "cancel"), id);
  expect((await state(page)).jobs[0].status).toBe("cancelled");
  const cancelledBytes = (await fs.stat(partial)).size;
  expect(cancelledBytes).toBeGreaterThan(pausedBytes);
  await page.evaluate((id) => window.launcher.controlDownload(id, "resume"), id);
  await expect
    .poll(async () => (await state(page)).jobs[0].status, { timeout: 15_000 })
    .toBe("completed");
  expect(
    digest(await fs.readFile(path.join(added.jobs[0].directory, "1-persistent.bin"))),
  ).toBe(digest(Buffer.alloc(size, 112)));
});

test("invalid ranges and servers ignoring Range preserve the partial file without restarting", async ({
  desktop,
}) => {
  const size = 1024 * 1024;
  await setupRealDebrid(desktop.app, path.join(desktop.directory, "downloads"), {
    size,
    delay: 20,
  });
  await connect(desktop.page);
  const added = await desktop.page.evaluate(() =>
    window.launcher.startDownload({
      title: "range",
      uri: "https://host.example/range",
      method: "real-debrid",
    }),
  );
  const id = added.jobs[0].id;
  await waitBytes(desktop.page, id);
  await desktop.page.evaluate((id) => window.launcher.controlDownload(id, "pause"), id);
  const partial = path.join(added.jobs[0].directory, "1-range.bin.partial");
  const original = await fs.readFile(partial);
  await desktop.app.evaluate(() => {
    Reflect.get(globalThis, "downloadFixture").rangeMode = "bad";
  });
  await desktop.page.evaluate(
    (id) => window.launcher.controlDownload(id, "resume"),
    id,
  );
  await expect
    .poll(async () => (await state(desktop.page)).jobs[0].status)
    .toBe("error");
  expect((await state(desktop.page)).jobs[0].files[0].error).toBe("invalid-range");
  expect(await fs.readFile(partial)).toEqual(original);
  await desktop.app.evaluate(() => {
    Reflect.get(globalThis, "downloadFixture").rangeMode = "changed";
  });
  await desktop.page.evaluate(
    (id) => window.launcher.controlDownload(id, "resume"),
    id,
  );
  await expect
    .poll(async () => (await state(desktop.page)).jobs[0].status)
    .toBe("error");
  expect((await state(desktop.page)).jobs[0].files[0].error).toBe("file-changed");
  expect(await fs.readFile(partial)).toEqual(original);
  await desktop.app.evaluate(() => {
    Reflect.get(globalThis, "downloadFixture").rangeMode = "ignore";
    Reflect.get(globalThis, "downloadFixture").delay = 0;
  });
  await desktop.page.evaluate(
    (id) => window.launcher.controlDownload(id, "resume"),
    id,
  );
  await expect
    .poll(async () => (await state(desktop.page)).jobs[0].status)
    .toBe("error");
  expect((await state(desktop.page)).jobs[0].files[0].error).toBe(
    "resume-not-supported",
  );
  expect(await fs.readFile(partial)).toEqual(original);
  await desktop.app.evaluate(() => {
    Reflect.get(globalThis, "downloadFixture").rangeMode = "normal";
  });
  await desktop.page.evaluate(
    (id) => window.launcher.controlDownload(id, "resume"),
    id,
  );
  await expect
    .poll(async () => (await state(desktop.page)).jobs[0].status)
    .toBe("completed");
  expect((await state(desktop.page)).jobs[0].files[0].restarted).not.toBe(true);
  expect(
    digest(await fs.readFile(path.join(added.jobs[0].directory, "1-range.bin"))),
  ).toBe(digest(Buffer.alloc(size, 114)));
});

test("Real-Debrid downloads every torrent file automatically with one game progress bar", async ({
  desktop,
}) => {
  const { page, directory } = desktop;
  const size = 2 * 1024 * 1024;
  await setupRealDebrid(desktop.app, path.join(directory, "downloads"), {
    size,
    delay: 20,
  });
  await connect(page);
  const torrent = path.join(directory, "fixture.torrent");
  await fs.writeFile(torrent, "d4:infod4:name7:fixtureee");
  await desktop.app.evaluate(({ dialog }, torrent) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [torrent] });
  }, torrent);
  await page.getByRole("button", { name: "Descargas", exact: true }).click();
  await page.getByRole("button", { name: "Abrir .torrent", exact: true }).click();
  await page.getByRole("button", { name: "Añadir a la cola", exact: true }).click();
  const job = (await state(page)).jobs[0];
  await Promise.all([waitBytes(page, job.id, "1"), waitBytes(page, job.id, "2")]);
  expect(
    await desktop.app.evaluate(
      () => Reflect.get(globalThis, "downloadFixture").uploaded,
    ),
  ).toBe(true);
  expect(
    await desktop.app.evaluate(
      () => Reflect.get(globalThis, "downloadFixture").selected,
    ),
  ).toEqual(["1", "2"]);
  await expect(
    page.getByRole("progressbar", { name: "Progreso de fixture.torrent", exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByText("folder/alpha.bin", { exact: true })).toHaveCount(0);
  await expect(page.getByText("folder/beta.bin", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Pausar tarea", exact: true }).click();
  expect(
    (await state(page)).jobs[0].files.every((file) => file.status === "paused"),
  ).toBe(true);
  await page.getByRole("button", { name: "Reanudar tarea", exact: true }).click();
  await expect
    .poll(async () => (await state(page)).jobs[0].status, { timeout: 15_000 })
    .toBe("completed");
  const completed = (await state(page)).jobs[0];
  expect(completed.bytes).toBe(size * 2);
  expect(completed.total).toBe(size * 2);
  expect(completed.progress).toBe(100);
  expect(await fs.readFile(path.join(job.directory, "1-alpha.bin"))).toEqual(
    Buffer.alloc(size, 97),
  );
  expect(await fs.readFile(path.join(job.directory, "2-beta.bin"))).toEqual(
    Buffer.alloc(size, 98),
  );
  await expect(page.getByRole("progressbar")).toHaveCount(1);
});

test("magnet downloads all files without selection and invalid links cannot start", async ({
  desktop,
}) => {
  const { page } = desktop;
  await setupRealDebrid(desktop.app, path.join(desktop.directory, "downloads"));
  await connect(page);
  await page.evaluate(() =>
    window.launcher.startDownload({
      title: "magnet",
      uri: `magnet:?xt=urn:btih:${"a".repeat(40)}`,
      method: "real-debrid",
    }),
  );
  await expect.poll(async () => (await state(page)).jobs[0].status).toBe("completed");
  expect(
    await desktop.app.evaluate(
      () => Reflect.get(globalThis, "downloadFixture").selected,
    ),
  ).toEqual(["1", "2"]);
  expect(
    (await state(page)).jobs[0].files.every(
      (file) => file.selected && file.status === "completed",
    ),
  ).toBe(true);
  for (const uri of [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "magnet:?xt=bad",
    "https://user:password@example.org/a",
  ]) {
    await expect(
      page.evaluate(
        (uri) =>
          window.launcher.startDownload({ title: "invalid", uri, method: "torrent" }),
        uri,
      ),
    ).rejects.toThrow();
  }
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page.getByRole("combobox", { name: "Idioma" }).selectOption("en");
  await page.getByRole("button", { name: "Downloads", exact: true }).click();
  await page.getByRole("button", { name: "Add download", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Add download", exact: true }),
  ).toBeVisible();
});

for (const source of ["magnet", "file"] as const) {
  test(`integrated BitTorrent ${source} automatically downloads all files, pauses and verifies pieces on resume`, async ({
    desktop,
  }) => {
    const { page, directory } = desktop;
    const folder = path.join(directory, "torrent-downloads");
    await desktop.app.evaluate(() => {
      const errors: string[] = [];
      Reflect.set(globalThis, "torrentUncaughtErrors", errors);
      process.on("uncaughtExceptionMonitor", (error) =>
        errors.push(error.stack ?? error.message),
      );
    });
    const seedFolder = path.join(directory, "seed");
    await fs.mkdir(folder);
    await fs.mkdir(seedFolder);
    const require = createRequire(path.resolve("apps/desktop/package.json"));
    const webtorrentPath = require.resolve("webtorrent");
    const discoveryPath = await fs.realpath(
      path.join(path.dirname(webtorrentPath), "../torrent-discovery/index.js"),
    );
    const trackerPath = await fs.realpath(
      path.join(path.dirname(discoveryPath), "../bittorrent-tracker/index.js"),
    );
    const { Server } = await import(pathToFileURL(trackerPath).href);
    const { default: WebTorrent } = await import(pathToFileURL(webtorrentPath).href);
    const tracker = new Server({ udp: false, ws: false, http: true });
    await new Promise<void>((resolve, reject) => {
      tracker.once("error", reject);
      tracker.listen(0, "127.0.0.1", resolve);
    });
    const trackerUrl = `http://127.0.0.1:${tracker.http.address().port}/announce`;
    const seeder = new WebTorrent({
      dht: false,
      lsd: false,
      natUpnp: false,
      natPmp: false,
      utp: false,
      uploadLimit: 512 * 1024,
    });
    seeder.on("error", () => undefined);
    const size = 1024 * 1024;

    try {
      const sourceData = await new Promise<{ magnet: string; metainfo: number[] }>(
        (resolve, reject) => {
          const torrent = seeder.seed(
            [
              Object.assign(Buffer.alloc(size, 97), { name: "alpha.bin" }),
              Object.assign(Buffer.alloc(size, 98), { name: "beta.bin" }),
            ],
            { name: "fixture", path: seedFolder, announce: [trackerUrl] },
            (ready: { magnetURI: string; torrentFile: Uint8Array }) =>
              resolve({
                magnet: ready.magnetURI,
                metainfo: Array.from(ready.torrentFile),
              }),
          );
          torrent.once("error", reject);
        },
      );
      await desktop.app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
      }, folder);
      await page.evaluate(() => window.launcher.chooseDownloadDirectory());
      let torrentFileId: string | undefined;

      if (source === "file") {
        const torrentPath = path.join(directory, "fixture.torrent");
        await fs.writeFile(torrentPath, Buffer.from(sourceData.metainfo));
        await desktop.app.evaluate(({ dialog }, torrentPath) => {
          dialog.showOpenDialog = async () => ({
            canceled: false,
            filePaths: [torrentPath],
          });
        }, torrentPath);
        torrentFileId = (await page.evaluate(() =>
          window.launcher.chooseDownloadTorrent(),
        ))!.id;
      }
      await page.evaluate(
        ({ uri, torrentFileId }) =>
          window.launcher.startDownload({
            title: "Torrent fixture",
            ...(torrentFileId ? { torrentFileId } : { uri }),
            method: "torrent",
          }),
        { uri: sourceData.magnet, torrentFileId },
      );
      await expect.poll(async () => (await state(page)).jobs[0].files.length).toBe(2);
      const initial = (await state(page)).jobs[0];
      expect(initial.files.every((file) => file.selected)).toBe(true);
      await expect
        .poll(async () => (await state(page)).jobs[0].bytes, { timeout: 15_000 })
        .toBeGreaterThan(0);
      await page.evaluate(
        (id) => window.launcher.controlDownload(id, "pause"),
        initial.id,
      );
      expect((await state(page)).jobs[0].status).toBe("paused");
      await page.evaluate(
        (id) => window.launcher.controlDownload(id, "resume"),
        initial.id,
      );
      await expect
        .poll(async () => (await state(page)).jobs[0].status, { timeout: 30_000 })
        .toBe("completed");
      const completed = (await state(page)).jobs[0];
      expect(
        await desktop.app.evaluate(() =>
          Reflect.get(globalThis, "torrentUncaughtErrors"),
        ),
      ).toEqual([]);
      expect(
        completed.files.every(
          (file) => file.status === "completed" && file.progress === 100,
        ),
      ).toBe(true);
      for (const file of completed.files) {
        expect(
          digest(await fs.readFile(path.join(completed.directory, file.name))),
        ).toBe(digest(Buffer.alloc(size, file.name.includes("alpha") ? 97 : 98)));
      }
    } finally {
      await new Promise<void>((resolve) => seeder.destroy(() => resolve()));
      await new Promise<void>((resolve) => tracker.close(() => resolve()));
    }
  });
}

for (const legacyStatus of ["waiting-selection", "paused"] as const) {
  test(`legacy ${legacyStatus} selection resumes and completes without losing selected files`, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-selection-"));
    const folder = path.join(directory, "downloads");
    const data = path.join(directory, "data");
    await fs.mkdir(data, { recursive: true });
    await fs.writeFile(
      path.join(data, "downloads.json"),
      JSON.stringify({
        directory: folder,
        encryptedToken: null,
        account: null,
        jobs: [
          {
            id: "legacy-selection",
            title: "Legacy selection",
            uri: `magnet:?xt=urn:btih:${"a".repeat(40)}`,
            method: "real-debrid",
            status: legacyStatus,
            selectionConfirmed: false,
            directory: path.join(folder, "legacy"),
            bytes: 0,
            total: 10,
            speed: 0,
            progress: 0,
            peers: 0,
            cloudProgress: 0,
            error: null,
            createdAt: new Date().toISOString(),
            files: ["alpha", "beta"].map((name, index) => ({
              id: String(index + 1),
              name: `folder/${name}.bin`,
              total: 5,
              bytes: 0,
              progress: 0,
              speed: 0,
              error: null,
              selected: legacyStatus === "waiting-selection" || index === 0,
              status: "paused",
            })),
          },
        ],
      }),
    );
    let app: ElectronApplication | undefined;

    try {
      ({ app } = await launchIsolatedDesktop(directory));
      const page = await app.firstWindow();
      await expect(
        page
          .getByRole("navigation")
          .getByRole("button", { name: /^(Añadir juego|Add game)$/ }),
      ).toBeVisible();
      await setupRealDebrid(app, folder);
      const migrated = (await state(page)).jobs[0];
      expect(migrated.status).toBe("paused");
      expect(migrated.selectionConfirmed).toBe(true);
      expect(migrated.files.map((file) => file.selected)).toEqual([
        true,
        legacyStatus === "waiting-selection",
      ]);
      await page.evaluate(() => window.launcher.connectRealDebrid("fixture_token"));
      await page.evaluate(() =>
        window.launcher.controlDownload("legacy-selection", "resume"),
      );
      await expect
        .poll(async () => (await state(page)).jobs[0].status)
        .toBe("completed");
      expect(
        await app.evaluate(() => Reflect.get(globalThis, "downloadFixture").selected),
      ).toEqual(legacyStatus === "waiting-selection" ? ["1", "2"] : ["1"]);
      const completed = (await state(page)).jobs[0];

      for (const file of completed.files.filter((file) => file.selected)) {
        expect(
          await fs.readFile(
            path.join(completed.directory, `${file.id}-${path.basename(file.name)}`),
          ),
        ).toEqual(Buffer.alloc(5, file.id === "1" ? 97 : 98));
      }
    } finally {
      await app?.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
}

test("magnet uses Real-Debrid and automatically downloads a grouped archive", async ({
  desktop,
}) => {
  const { page, directory } = desktop;
  await setupRealDebrid(desktop.app, path.join(directory, "downloads"), {
    bundle: true,
  });
  await page.getByRole("button", { name: "Descargas", exact: true }).click();
  await page
    .getByLabel("Enlaces magnet o HTTPS · uno por línea")
    .fill(`magnet:?xt=urn:btih:${"b".repeat(40)}&dn=Fixture+Game`);
  await expect(page.getByRole("radio", { name: /Real-Debrid Envía/ })).toBeChecked();
  await page.getByRole("button", { name: "Conectar Real-Debrid", exact: true }).click();
  await page.getByRole("button", { name: "Elegir carpeta", exact: true }).click();
  await page.getByLabel("Clave API de Real-Debrid").fill("fixture_token");
  await page.getByRole("button", { name: "Conectar cuenta", exact: true }).click();
  await expect(page.getByText(/Conectado como fixture-user/)).toBeVisible();
  await page.getByRole("button", { name: "Cola de descargas", exact: true }).click();
  await expect(page.getByLabel("Enlaces magnet o HTTPS · uno por línea")).toHaveValue(
    /magnet:/,
  );
  await page.getByRole("button", { name: "Añadir a la cola", exact: true }).click();
  await expect.poll(async () => (await state(page)).jobs[0].status).toBe("completed");
  const job = (await state(page)).jobs[0];
  expect(job.method).toBe("real-debrid");
  expect(job.progress).toBe(100);
  expect(await fs.readFile(path.join(job.directory, "bundle-bundle.bin"))).toEqual(
    Buffer.alloc(5, 98),
  );
  await expect(
    page.getByRole("progressbar", { name: "Progreso de Fixture Game", exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByText("bundle.bin", { exact: true })).toHaveCount(0);
});

test("download hierarchy filters history, preserves files and isolates task failures across themes", async ({
  desktop,
}, testInfo) => {
  const { page, app, directory } = desktop;
  await setupRealDebrid(app, path.join(directory, "downloads"));
  await connect(page);
  await page.evaluate(async () => {
    for (const title of [
      "Completed game",
      "A very long game title with an expansion and additional content that must remain readable in a compact window",
    ]) {
      await window.launcher.startDownload({
        title,
        uri: `https://host.example/${encodeURIComponent(title)}`,
        method: "real-debrid",
      });
    }
  });
  await expect
    .poll(async () =>
      (await state(page)).jobs.every((job) => job.status === "completed"),
    )
    .toBe(true);
  const jobs = (await state(page)).jobs;
  await page.getByRole("button", { name: "Descargas", exact: true }).click();
  await expect(
    page.getByLabel("Enlaces magnet o HTTPS · uno por línea"),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "En curso 0", exact: true }).click();
  await expect(page.getByText("No hay descargas en esta sección.")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByRole("button", { name: "Historial 2", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("downloads:open");
    ipcMain.handle("downloads:open", async () => {
      await new Promise((resolve) => setTimeout(resolve, 750));
      throw new Error("destination-exists");
    });
  });
  const first = page.getByRole("article").first();
  const second = page.getByRole("article").nth(1);
  await first.getByRole("button", { name: "Abrir carpeta", exact: true }).click();
  await expect(first).toHaveAttribute("aria-busy", "true");
  await expect(
    second.getByRole("button", { name: "Abrir carpeta", exact: true }),
  ).toBeEnabled();
  await expect(first.getByRole("alert")).toContainText("No se ha sobrescrito");
  await expect(second.getByRole("alert")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 980, height: 640 });
  for (const theme of ["forest", "aurora", "ember", "amethyst", "glacier"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.accent = theme),
      theme,
    );
    await expect
      .poll(() =>
        page
          .locator(".downloads-view")
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      )
      .toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`downloads-${theme}.png`) });
  }
  await page.getByRole("button", { name: "Añadir descarga", exact: true }).click();
  const input = page.getByLabel("Enlaces magnet o HTTPS · uno por línea");
  await expect(input).toBeVisible();
  await input.fill("https://host.example/example");
  await page.getByRole("radio", { name: /BitTorrent integrado/ }).check();
  await expect(
    page.getByRole("alert").filter({ hasText: "BitTorrent admite" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Añadir a la cola", exact: true }),
  ).toBeDisabled();
  await page.getByRole("radio", { name: /Real-Debrid Envía/ }).check();
  await expect(
    page.getByRole("button", { name: "Añadir a la cola", exact: true }),
  ).toBeEnabled();
  await input.focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Pegar enlace", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Abrir .torrent", exact: true }),
  ).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("downloads-composer.png") });
  await page.getByRole("button", { name: "Añadir descarga", exact: true }).click();
  await page.getByRole("button", { name: "Limpiar completadas", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(
    page.getByText("Completadas retiradas del historial. Tus archivos se conservan."),
  ).toBeVisible();
  for (const job of jobs) {
    expect((await fs.readdir(job.directory)).length).toBeGreaterThan(0);
  }
  await page
    .getByRole("navigation", { name: "Descargas", exact: true })
    .getByRole("button", { name: "Configuración", exact: true })
    .click();
  await expect(page.locator(".downloads-config section").first()).toContainText(
    "Carpeta de descargas",
  );
  await page.screenshot({ path: testInfo.outputPath("downloads-configuration.png") });
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await expect(page.locator(".settings-view")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("settings.png") });
  await page.getByRole("button", { name: "Añadir juego", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("add-game.png") });
});

test("global pause preserves individual pauses, priority chooses the next task and limits persist", async ({
  desktop,
}) => {
  const { page, app, directory } = desktop;
  const folder = path.join(directory, "controlled downloads");
  await setupRealDebrid(app, folder, { size: 4 * 1024 * 1024, delay: 20 });
  await connect(page);
  await page.evaluate(() =>
    window.launcher.configureDownloads({
      maxConcurrent: 1,
      downloadLimitBytesPerSecond: 0,
    }),
  );
  const ids = await page.evaluate(async () => {
    const result: string[] = [];

    for (const title of ["first", "priority", "manual"]) {
      const snapshot = await window.launcher.startDownload({
        title,
        uri: `https://host.example/${title}`,
        method: "real-debrid",
      });
      result.push(snapshot.jobs.find((job) => job.title === title)!.id);
    }
    await window.launcher.setDownloadPriority(result[1], 1);
    await window.launcher.controlDownload(result[2], "pause");
    return result;
  });
  await waitBytes(page, ids[0]);
  await page.evaluate(() => window.launcher.controlAllDownloads("pause"));
  let snapshot = await state(page);
  expect(snapshot.jobs.every((job) => job.status === "paused")).toBe(true);
  expect(new Set(snapshot.bulkPausedIds)).toEqual(new Set(ids.slice(0, 2)));
  await page.evaluate(() => window.launcher.controlAllDownloads("resume"));
  await waitBytes(page, ids[1]);
  snapshot = await state(page);
  expect(snapshot.jobs.find((job) => job.id === ids[0])?.status).toBe("queued");
  expect(snapshot.jobs.find((job) => job.id === ids[2])?.status).toBe("paused");
  await page.evaluate(async () => {
    await window.launcher.controlAllDownloads("pause");
    await window.launcher.configureDownloads({
      maxConcurrent: 1,
      downloadLimitBytesPerSecond: 64 * 1024,
    });
  });
  const restarted = await desktop.restart();
  const persisted = await state(restarted);
  expect(persisted.maxConcurrent).toBe(1);
  expect(persisted.downloadLimitBytesPerSecond).toBe(64 * 1024);
  expect(new Set(persisted.bulkPausedIds)).toEqual(new Set(ids.slice(0, 2)));
  expect(persisted.jobs.find((job) => job.id === ids[2])?.status).toBe("paused");
});

test("completed downloads open a prefilled local-game flow without executing the file", async ({
  desktop,
}) => {
  const { page, app, directory } = desktop;
  await setupRealDebrid(app, path.join(directory, "downloads"));
  await connect(page);
  const added = await page.evaluate(() =>
    window.launcher.startDownload({
      title: "Downloaded Adventure",
      uri: "https://host.example/adventure",
      method: "real-debrid",
    }),
  );
  const jobId = added.jobs[0].id;
  await expect
    .poll(async () => (await state(page)).jobs.find((job) => job.id === jobId)?.status)
    .toBe("completed");
  const job = (await state(page)).jobs.find((job) => job.id === jobId)!;
  const executable = path.join(
    job.directory,
    process.platform === "win32" ? "Game.exe" : "game.sh",
  );
  await fs.writeFile(executable, "fixture executable", { mode: 0o700 });
  await app.evaluate(({ dialog }, executable) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [executable] });
  }, executable);
  await page.getByRole("button", { name: "Descargas", exact: true }).click();
  await page.getByRole("button", { name: "Añadir a biblioteca", exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByLabel("Nombre del juego")).toHaveValue(
    "Downloaded Adventure",
  );
  await expect(modal.locator("input[readonly]")).toHaveValue(executable);
  await modal
    .getByRole("button", { name: "Añadir a la biblioteca", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  const library = await page.evaluate(() => window.launcher.listGames());
  expect(
    library.games.some(
      (game) =>
        game.title === "Downloaded Adventure" && game.installPath === executable,
    ),
  ).toBe(true);
  expect(library.sessions).toHaveLength(0);
});

test("Real-Debrid bundle resumes without ETag or Last-Modified after an application restart", async ({
  desktop,
}) => {
  const size = 2 * 1024 * 1024;
  const folder = path.join(desktop.directory, "downloads");
  await setupRealDebrid(desktop.app, folder, {
    size,
    delay: 15,
    bundle: true,
    validators: false,
  });
  await connect(desktop.page);
  const added = await desktop.page.evaluate(() =>
    window.launcher.startDownload({
      title: "headerless bundle",
      uri: "magnet:?xt=urn:btih:0123456789012345678901234567890123456789",
      method: "real-debrid",
    }),
  );
  const id = added.jobs[0].id;
  await expect
    .poll(async () => (await state(desktop.page)).jobs[0].bytes)
    .toBeGreaterThan(128 * 1024);
  await desktop.page.evaluate((id) => window.launcher.controlDownload(id, "pause"), id);
  const partial = path.join(added.jobs[0].directory, "bundle-bundle.bin.partial");
  const saved = await fs.readFile(partial);
  const metadata = JSON.parse(
    await fs.readFile(path.join(desktop.directory, "data/downloads.json"), "utf8"),
  );
  expect(metadata.jobs[0].files[0].etag).toBeUndefined();
  expect(metadata.jobs[0].files[0].modified).toBeUndefined();
  const page = await desktop.restart();
  expect((await state(page)).jobs[0].bytes).toBe(saved.length);
  await setupRealDebrid(desktop.app, folder, {
    size,
    delay: 10,
    bundle: true,
    validators: false,
  });
  await desktop.app.evaluate(() => {
    Reflect.get(globalThis, "downloadFixture").selected = ["1", "2"];
  });
  await page.evaluate(() => window.launcher.connectRealDebrid("fixture_token"));
  await page.evaluate((id) => window.launcher.controlDownload(id, "resume"), id);
  await expect
    .poll(async () => (await state(page)).jobs[0].status, { timeout: 15000 })
    .toBe("completed");
  const requests = await desktop.app.evaluate(
    () =>
      Reflect.get(globalThis, "downloadFixture").requests as {
        range: string | null;
        ifRange: string | null;
      }[],
  );
  expect(requests[0]).toMatchObject({
    range: `bytes=${saved.length - 65536}-`,
    ifRange: null,
  });
  const completed = await fs.readFile(
    path.join(added.jobs[0].directory, "bundle-bundle.bin"),
  );
  expect(completed.subarray(0, saved.length)).toEqual(saved);
  expect(digest(completed)).toBe(digest(Buffer.alloc(size, 98)));
  expect((await state(page)).jobs[0].files[0].restarted).not.toBe(true);
});

test("headerless resume rejects changed overlap bytes without overwriting the partial file", async ({
  desktop,
}) => {
  const size = 1024 * 1024;
  await setupRealDebrid(desktop.app, path.join(desktop.directory, "downloads"), {
    size,
    delay: 20,
    validators: false,
  });
  await connect(desktop.page);
  const added = await desktop.page.evaluate(() =>
    window.launcher.startDownload({
      title: "overlap",
      uri: "https://host.example/overlap",
      method: "real-debrid",
    }),
  );
  const id = added.jobs[0].id;
  await waitBytes(desktop.page, id);
  await desktop.page.evaluate((id) => window.launcher.controlDownload(id, "pause"), id);
  const partial = path.join(added.jobs[0].directory, "1-overlap.bin.partial");
  const saved = await fs.readFile(partial);
  await desktop.app.evaluate(() => {
    Reflect.get(globalThis, "downloadFixture").rangeMode = "corrupt";
  });
  await desktop.page.evaluate(
    (id) => window.launcher.controlDownload(id, "resume"),
    id,
  );
  await expect
    .poll(async () => (await state(desktop.page)).jobs[0].status)
    .toBe("error");
  expect((await state(desktop.page)).jobs[0].files[0].error).toBe("file-changed");
  expect(await fs.readFile(partial)).toEqual(saved);
  await desktop.app.evaluate(() => {
    Reflect.get(globalThis, "downloadFixture").rangeMode = "normal";
    Reflect.get(globalThis, "downloadFixture").delay = 0;
  });
  await desktop.page.evaluate(
    (id) => window.launcher.controlDownload(id, "resume"),
    id,
  );
  await expect
    .poll(async () => (await state(desktop.page)).jobs[0].status)
    .toBe("completed");
  expect(
    digest(await fs.readFile(path.join(added.jobs[0].directory, "1-overlap.bin"))),
  ).toBe(digest(Buffer.alloc(size, 111)));
});
