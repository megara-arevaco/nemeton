import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  downloadHttpFile,
  DownloadRateLimiter,
  type StoredDownloadFile,
} from "../apps/desktop/src/main/download-http";

test("file transfers use the supplied transport while throttled, without Node fetch", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-transport-"));
  const original = globalThis.fetch;
  const content = Buffer.alloc(256 * 1024, 97);
  const file: StoredDownloadFile = {
    id: "1",
    name: "game.bin",
    total: content.length,
    bytes: 0,
    progress: 0,
    speed: 0,
    selected: true,
    status: "queued",
    error: null,
  };
  let requests = 0;

  try {
    globalThis.fetch = async () => {
      throw new Error("Node fetch must not handle the transfer");
    };
    await downloadHttpFile(
      file,
      directory,
      async () => ({ download: "https://fixture.test/game", filesize: content.length }),
      new AbortController().signal,
      new DownloadRateLimiter(() => 1024 * 1024),
      async (_input, init) => {
        requests++;
        expect(new Headers(init?.headers).get("Accept-Encoding")).toBe("identity");
        let offset = 0;
        return new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              if (offset === content.length) {
                controller.close();
                return;
              }
              controller.enqueue(content.subarray(offset, offset + 65536));
              offset += 65536;
            },
          }),
        );
      },
    );
    expect(requests).toBe(1);
    expect(file.status).toBe("completed");
    expect(await fs.readFile(path.join(directory, "1-game.bin"))).toEqual(content);
  } finally {
    globalThis.fetch = original;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

for (const savedLength of [5000, 131111]) {
  test(`headerless resume verifies a ${savedLength}-byte prefix across uneven chunks without duplicating data`, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-http-resume-"));
    const original = globalThis.fetch;
    const content = Buffer.from(
      Array.from(
        { length: 400000 },
        (_, index) => (index * 31 + Math.floor(index / 251)) % 251,
      ),
    );
    const partial = path.join(directory, "1-game.bin.partial");
    const file: StoredDownloadFile = {
      id: "1",
      name: "game.bin",
      total: content.length,
      bytes: savedLength,
      progress: 10,
      speed: 0,
      selected: true,
      status: "paused",
      error: null,
      restarted: true,
    };

    try {
      await fs.writeFile(partial, content.subarray(0, savedLength));
      const expectedStart = Math.max(0, savedLength - 65536);
      globalThis.fetch = async (_input, init) => {
        const headers = new Headers(init?.headers);
        expect(headers.get("range")).toBe(`bytes=${expectedStart}-`);
        expect(headers.has("if-range")).toBe(false);
        let position = expectedStart,
          chunkIndex = 0;
        const sizes = [137, 32768, 73, 65536];
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (position === content.length) {
              controller.close();
              return;
            }

            const end = Math.min(
              content.length,
              position + sizes[chunkIndex++ % sizes.length]!,
            );
            controller.enqueue(content.subarray(position, end));
            position = end;
          },
        });
        return new Response(body, {
          status: 206,
          headers: {
            "Content-Range": `bytes ${expectedStart}-${content.length - 1}/${content.length}`,
          },
        });
      };
      await downloadHttpFile(
        file,
        directory,
        async () => ({
          download: "https://fixture.test/game",
          filesize: content.length,
        }),
        new AbortController().signal,
      );
      expect(await fs.readFile(path.join(directory, "1-game.bin"))).toEqual(content);
      expect(file).toMatchObject({
        status: "completed",
        bytes: content.length,
        progress: 100,
      });
      expect(file.restarted).toBeUndefined();
      expect(await fs.stat(partial).catch(() => null)).toBeNull();
    } finally {
      globalThis.fetch = original;
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
}

test("a server returning the whole body cannot truncate an existing partial download", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-http-preserve-"));
  const original = globalThis.fetch;
  const partial = path.join(directory, "1-game.bin.partial");
  const saved = Buffer.from("already downloaded bytes");
  const file: StoredDownloadFile = {
    id: "1",
    name: "game.bin",
    total: 1000,
    bytes: saved.length,
    progress: 2,
    speed: 0,
    selected: true,
    status: "paused",
    error: null,
  };

  try {
    await fs.writeFile(partial, saved);
    globalThis.fetch = async () => new Response(new Uint8Array(1000), { status: 200 });
    await expect(
      downloadHttpFile(
        file,
        directory,
        async () => ({ download: "https://fixture.test/game", filesize: 1000 }),
        new AbortController().signal,
      ),
    ).rejects.toThrow("resume-not-supported");
    expect(await fs.readFile(partial)).toEqual(saved);
    expect(
      await fs.stat(path.join(directory, "1-game.bin")).catch(() => null),
    ).toBeNull();
  } finally {
    globalThis.fetch = original;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
