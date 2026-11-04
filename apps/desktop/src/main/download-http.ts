import { setTimeout as delay } from "node:timers/promises";
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

export class DownloadRateLimiter {
  private nextAt = 0;
  constructor(private readonly limit: () => number) {}
  async consume(bytes: number, signal: AbortSignal) {
    const limit = this.limit();

    if (limit <= 0) {
      this.nextAt = 0;
      return;
    }

    const now = performance.now();
    const start = Math.max(now, this.nextAt);
    this.nextAt = start + (bytes * 1000) / limit;
    if (start > now) {
      await delay(start - now, undefined, { signal });
    }
  }
}

export async function downloadHttpFile(
  file: StoredDownloadFile,
  directory: string,
  resolveLink: () => Promise<{ download: string; filesize: number }>,
  signal: AbortSignal,
  rateLimiter?: DownloadRateLimiter,
  fetchResponse: typeof globalThis.fetch = globalThis.fetch,
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

  const offset = (await regularFileSize(partial)) ?? 0;

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
  if (offset > file.total) {
    throw new Error("file-changed");
  }

  const strongEtag = file.etag && !file.etag.startsWith("W/") ? file.etag : undefined;
  const validator = strongEtag ?? file.modified;
  // Hosts without validators can still serve byte ranges. Verify the saved tail
  // against the remote overlap before appending, instead of discarding the file.
  const overlapLength = offset && !validator ? Math.min(offset, 64 * 1024) : 0;
  const requestedOffset = offset - overlapLength;
  const headers = new Headers({ "Accept-Encoding": "identity" });

  if (offset) {
    headers.set("Range", `bytes=${requestedOffset}-`);
    if (validator) {
      headers.set("If-Range", validator);
    }
  }

  const response = await fetchResponse(resolved.download, {
    headers,
    signal: AbortSignal.any([signal, AbortSignal.timeout(24 * 60 * 60 * 1000)]),
  });

  try {
    if (!response.ok || !response.body) {
      throw new Error(`http-${response.status}`);
    }
    if (response.status === 206) {
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
        response.headers.get("content-range") ?? "",
      );

      if (
        !range ||
        Number(range[1]) !== requestedOffset ||
        Number(range[2]) < requestedOffset ||
        Number(range[3]) !== file.total ||
        Number(range[2]) >= file.total
      ) {
        throw new Error("invalid-range");
      }

      const etag = response.headers.get("etag");
      const modified = response.headers.get("last-modified");

      if (
        (strongEtag && etag && strongEtag !== etag) ||
        (!strongEtag && file.modified && modified && file.modified !== modified)
      ) {
        throw new Error("file-changed");
      }
    } else if (response.status === 200) {
      if (offset) {
        throw new Error("resume-not-supported");
      }
    } else {
      throw new Error("invalid-response");
    }

    const etag = response.headers.get("etag");
    const modified = response.headers.get("last-modified") ?? undefined;
    const acceptResponse = () => {
      file.etag = etag && !etag.startsWith("W/") ? etag : undefined;
      file.modified = modified;
      delete file.restarted;
    };
    const exists = await regularFileSize(partial);

    if ((offset && exists === null) || (exists !== null && exists !== offset)) {
      throw new Error("partial-file-changed");
    }

    const output = await fs.open(
      partial,
      (exists === null ? constants.O_CREAT | constants.O_EXCL : 0) |
        constants.O_RDWR |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );

    try {
      const overlap = Buffer.alloc(overlapLength);
      let read = 0;

      while (read < overlapLength) {
        const result = await output.read(
          overlap,
          read,
          overlapLength - read,
          requestedOffset + read,
        );

        if (!result.bytesRead) {
          throw new Error("partial-file-changed");
        }
        read += result.bytesRead;
      }

      let verified = 0;

      if (!overlapLength) {
        acceptResponse();
      }
      file.bytes = offset;
      file.progress = file.total ? (offset / file.total) * 100 : 0;
      file.status = "downloading";
      let previousTime = performance.now();
      let previousBytes = offset;

      for await (const received of response.body) {
        signal.throwIfAborted();
        await rateLimiter?.consume(received.length, signal);
        let chunk = received;

        if (verified < overlapLength) {
          const length = Math.min(chunk.length, overlapLength - verified);

          if (
            !Buffer.from(chunk.subarray(0, length)).equals(
              overlap.subarray(verified, verified + length),
            )
          ) {
            throw new Error("file-changed");
          }
          verified += length;
          chunk = chunk.subarray(length);
          if (verified === overlapLength) {
            acceptResponse();
          }
          if (!chunk.length) {
            continue;
          }
        }
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
      if (verified !== overlapLength || file.bytes !== file.total) {
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
    await response.body?.cancel().catch(() => undefined);
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
