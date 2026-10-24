import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import type { ElectronApplication, Page } from "@playwright/test";
import { test, expect } from "./fixtures";

async function setupRealDebrid(
  app: ElectronApplication,
  folder: string,
  options: { size?: number; delay?: number; rangeMode?: string } = {},
) {
  await fs.mkdir(folder, { recursive: true });
  await app.evaluate(
    ({ dialog }, { folder, options }) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
      const state = {
        size: options.size ?? 5,
        delay: options.delay ?? 0,
        rangeMode: options.rangeMode ?? "normal",
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
      globalThis.fetch = async (input, init) => {
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
            links: state.selected.map(
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
                url.pathname.charCodeAt(1) || 65,
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
            ETag: state.rangeMode === "changed" ? '"changed"' : '"fixture-v1"',
            "Accept-Ranges": "bytes",
          };

          if (requested && state.rangeMode !== "ignore") {
            responseHeaders["Content-Range"] =
              `bytes ${offset + (state.rangeMode === "bad" ? 1 : 0)}-${state.size - 1}/${state.size}`;
          }
          return new Response(body, {
            status: requested && state.rangeMode !== "ignore" ? 206 : 200,
            headers: responseHeaders,
          });
        }
        throw new Error(`Unexpected request: ${url.hostname}${url.pathname}`);
      };
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

test("link-only UI saves configuration, downloads and shows one progress bar per file", async ({
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
  await expect(page.getByText("Completada", { exact: true })).toHaveCount(4);
  await expect(page.getByRole("progressbar")).toHaveCount(2);
  await expect(
    page.getByLabel("Enlaces magnet o HTTPS · uno por línea"),
  ).not.toBeVisible();
  await expect(page.getByRole("progressbar").first()).toBeInViewport();
  const snapshot = await state(page);
  expect(snapshot.jobs).toHaveLength(2);
  for (const job of snapshot.jobs) {
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

test("incorrect ranges are rejected and servers ignoring Range restart without appending", async ({
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
    .toBe("completed");
  expect((await state(desktop.page)).jobs[0].files[0].restarted).toBe(true);
  expect(
    digest(await fs.readFile(path.join(added.jobs[0].directory, "1-range.bin"))),
  ).toBe(digest(Buffer.alloc(size, 114)));
});

test("Real-Debrid uploads local torrents, selects files and controls each transfer", async ({
  desktop,
}) => {
  const { page, directory } = desktop;
  await setupRealDebrid(desktop.app, path.join(directory, "downloads"), {
    size: 2 * 1024 * 1024,
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
  await expect(page.getByText("fixture.torrent", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Añadir a la cola", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Elige los archivos que quieres descargar" }),
  ).toBeVisible();
  expect(
    await desktop.app.evaluate(
      () => Reflect.get(globalThis, "downloadFixture").uploaded,
    ),
  ).toBe(true);
  expect(
    await desktop.app.evaluate(() => Reflect.get(globalThis, "downloadFixture").active),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Descargar seleccionados (2)", exact: true })
    .click();
  const job = (await state(page)).jobs[0];
  await Promise.all([waitBytes(page, job.id, "1"), waitBytes(page, job.id, "2")]);
  await expect(
    page.getByRole("progressbar", {
      name: "Progreso de folder/alpha.bin",
      exact: true,
    }),
  ).toBeVisible();
  const alpha = page.getByRole("group", { name: "folder/alpha.bin", exact: true });
  await alpha.getByRole("button", { name: "Pausar archivo", exact: true }).click();
  await expect(alpha.getByText("Pausada", { exact: true })).toBeVisible();
  await page.evaluate(
    (id) => window.launcher.controlDownloadFile(id, "2", "cancel"),
    job.id,
  );
  await expect
    .poll(
      async () =>
        (await state(page)).jobs[0].files.find((file) => file.id === "2")?.status,
    )
    .toBe("cancelled");
  await alpha.getByRole("button", { name: "Reanudar archivo", exact: true }).click();
  await expect
    .poll(async () => (await state(page)).jobs[0].files[0].status, { timeout: 15_000 })
    .toBe("completed");
  expect((await state(page)).jobs[0].files[1].status).toBe("cancelled");
  expect(await fs.readFile(path.join(job.directory, "1-alpha.bin"))).toEqual(
    Buffer.alloc(2 * 1024 * 1024, 97),
  );
  expect(
    await fs.stat(path.join(job.directory, "2-beta.bin")).catch(() => null),
  ).toBeNull();
});

test("magnet file selection excludes unchecked files and invalid links cannot start", async ({
  desktop,
}) => {
  const { page } = desktop;
  await setupRealDebrid(desktop.app, path.join(desktop.directory, "downloads"));
  await connect(page);
  const snapshot = await page.evaluate(() =>
    window.launcher.startDownload({
      title: "magnet",
      uri: `magnet:?xt=urn:btih:${"a".repeat(40)}`,
      method: "real-debrid",
    }),
  );
  await expect
    .poll(async () => (await state(page)).jobs[0].status)
    .toBe("waiting-selection");
  await page.evaluate(
    (id) => window.launcher.selectDownloadFiles(id, ["2"]),
    snapshot.jobs[0].id,
  );
  await expect.poll(async () => (await state(page)).jobs[0].status).toBe("completed");
  expect(
    await desktop.app.evaluate(
      () => Reflect.get(globalThis, "downloadFixture").selected,
    ),
  ).toEqual(["2"]);
  expect((await state(page)).jobs[0].files[0].selected).toBe(false);
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
  await expect(
    page.getByRole("heading", { name: "Add download", exact: true }),
  ).toBeVisible();
});

for (const source of ["magnet", "file"] as const) {
  test(`integrated BitTorrent ${source} selects multiple files, pauses and verifies pieces on resume`, async ({
    desktop,
  }) => {
    const { page, directory } = desktop;
    const folder = path.join(directory, "torrent-downloads");
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
      await expect
        .poll(async () => (await state(page)).jobs[0].status)
        .toBe("waiting-selection");
      const initial = (await state(page)).jobs[0];
      expect(initial.files).toHaveLength(2);
      expect(initial.files.every((file) => file.bytes === 0)).toBe(true);
      await page.evaluate(
        ({ id, ids }) => window.launcher.selectDownloadFiles(id, ids),
        {
          id: initial.id,
          ids: initial.files.map((file) => file.id),
        },
      );
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
