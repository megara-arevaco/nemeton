import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const queues = new Map<string, Promise<unknown>>();
const heldLocks = new AsyncLocalStorage<ReadonlySet<string>>();

export async function readTextIfExists(
  filePath: string,
  maxBytes = 64 * 1024 * 1024,
): Promise<string | null> {
  try {
    const info = await fs.stat(filePath);

    if (!info.isFile() || info.size > maxBytes) {
      throw new Error(
        "El archivo de datos supera el tamaño permitido o no es un archivo",
      );
    }
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/** Serialize complete read/modify/write operations, including nested service calls. */
export async function withFileLock<T>(
  filePath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(filePath);
  const held = heldLocks.getStore();

  if (held?.has(key)) {
    return operation();
  }

  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => heldLocks.run(new Set([...(held ?? []), key]), operation));
  queues.set(key, next);
  try {
    return await next;
  } finally {
    if (queues.get(key) === next) {
      queues.delete(key);
    }
  }
}

export async function writeJsonAtomically(
  filePath: string,
  value: unknown,
): Promise<boolean> {
  const text = JSON.stringify(value, null, 2);
  return withFileLock(filePath, async () => {
    const current = await fs
      .readFile(filePath, "utf8")
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return null;
        }
        throw error;
      });

    if (current === text) {
      return false;
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${randomUUID()}.tmp`;

    try {
      await fs.writeFile(temporary, text, { flag: "wx", mode: 0o600 });
      await fs.rename(temporary, filePath);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    return true;
  });
}
