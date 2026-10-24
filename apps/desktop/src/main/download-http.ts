import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { DownloadFile } from "../shared/downloads.js";

export interface StoredDownloadFile extends DownloadFile {
  link?: string;
  etag?: string;
  modified?: string;
}

export class TransferSlots {
  private active = 0;
  private waiters: (() => void)[] = [];
  constructor(private readonly maximum: number) {}

  async use<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    if (this.active >= this.maximum) {
      await new Promise<void>((resolve, reject) => {
        const ready = () => {
          signal.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          this.waiters = this.waiters.filter((item) => item !== ready);
          reject(signal.reason);
        };
        this.waiters.push(ready);
        signal.addEventListener("abort", abort, { once: true });
      });
    } else {
      this.active++;
    }
    try {
      signal.throwIfAborted();
      return await operation();
    } finally {
      const next = this.waiters.shift();

      if (next) {
        next();
      } else {
        this.active--;
      }
    }
  }
}

export async function completePartial(partial: string, target: string) {
  try {
    await fs.link(partial, target);
  } catch (error) {
    if (
      !["EPERM", "ENOTSUP", "EOPNOTSUPP"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    ) {
      throw error;
    }
    await fs.copyFile(partial, target, constants.COPYFILE_EXCL);
  }
  await fs.unlink(partial);
}

async function regularFileSize(file: string) {
  const info = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  });

  if (info && (!info.isFile() || info.isSymbolicLink())) {
    throw new Error("unsafe-file");
  }
  return info?.size ?? null;
}

export async function downloadHttpFile(
  file: StoredDownloadFile,
  directory: string,
  resolveLink: () => Promise<{ download: string; filesize: number }>,
  signal: AbortSignal,
) {
  const target = path.join(directory, `${file.id}-${safeFilename(file.name)}`);
  const partial = `${target}.partial`;
  const completeSize = await regularFileSize(target);

  if (completeSize !== null) {
    if (completeSize !== file.total) {
      throw new Error("destination-exists");
    }
    file.bytes = completeSize;
    file.progress = 100;
    file.status = "completed";
    return;
  }

  let offset = (await regularFileSize(partial)) ?? 0;

  if (file.total > 0 && offset === file.total) {
    await completePartial(partial, target);
    file.bytes = offset;
    file.progress = 100;
    file.status = "completed";
    return;
  }

  const resolved = await resolveLink();
  signal.throwIfAborted();
  if (file.total && resolved.filesize !== file.total) {
    throw new Error("file-changed");
  }
  file.total = resolved.filesize;
  if (offset > file.total || (offset && !file.etag && !file.modified)) {
    offset = 0;
    file.restarted = true;
  }

  const headers = new Headers({ "Accept-Encoding": "identity" });

  if (offset) {
    headers.set("Range", `bytes=${offset}-`);
    headers.set("If-Range", file.etag ?? file.modified!);
  }

  const response = await fetch(resolved.download, {
    headers,
    signal: AbortSignal.any([signal, AbortSignal.timeout(24 * 60 * 60 * 1000)]),
  });

  if (!response.ok || !response.body) {
    throw new Error(`http-${response.status}`);
  }
  try {
    if (response.status === 206) {
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
        response.headers.get("content-range") ?? "",
      );

      if (
        !range ||
        Number(range[1]) !== offset ||
        Number(range[2]) < offset ||
        Number(range[3]) !== file.total ||
        Number(range[2]) >= file.total
      ) {
        throw new Error("invalid-range");
      }

      const etag = response.headers.get("etag");
      const modified = response.headers.get("last-modified");

      if (
        (file.etag && etag && file.etag !== etag) ||
        (!file.etag && file.modified && modified && file.modified !== modified)
      ) {
        throw new Error("file-changed");
      }
    } else if (response.status === 200) {
      if (offset) {
        file.restarted = true;
        offset = 0;
      }
    } else {
      throw new Error("invalid-response");
    }

    const etag = response.headers.get("etag");
    file.etag = etag && !etag.startsWith("W/") ? etag : undefined;
    file.modified = response.headers.get("last-modified") ?? undefined;
    const exists = await regularFileSize(partial);
    const output = await fs.open(
      partial,
      (exists === null ? constants.O_CREAT | constants.O_EXCL : 0) |
        constants.O_WRONLY |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );

    try {
      if (!offset) {
        await output.truncate(0);
      }
      file.bytes = offset;
      file.status = "downloading";
      let previousTime = performance.now();
      let previousBytes = offset;

      for await (const chunk of response.body) {
        signal.throwIfAborted();
        if (file.bytes + chunk.length > file.total) {
          throw new Error("file-too-large");
        }

        let written = 0;

        while (written < chunk.length) {
          const result = await output.write(
            chunk,
            written,
            chunk.length - written,
            file.bytes + written,
          );

          if (!result.bytesWritten) {
            throw new Error("write-failed");
          }
          written += result.bytesWritten;
        }
        file.bytes += chunk.length;
        file.progress = file.total ? (file.bytes / file.total) * 100 : 0;
        const now = performance.now();

        if (now - previousTime >= 250) {
          file.speed = ((file.bytes - previousBytes) * 1000) / (now - previousTime);
          previousBytes = file.bytes;
          previousTime = now;
        }
      }
      signal.throwIfAborted();
      if (file.bytes !== file.total) {
        throw new Error("incomplete-file");
      }
      await output.sync();
    } finally {
      await output.close();
    }
    signal.throwIfAborted();
    await completePartial(partial, target);
    file.status = "completed";
    file.progress = 100;
  } finally {
    file.speed = 0;
    await response.body.cancel().catch(() => undefined);
  }
}

export function safeFilename(value: string) {
  const name = path
    .basename(value.replaceAll("\\", "/"))
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 160);
  return name || "archivo";
}
