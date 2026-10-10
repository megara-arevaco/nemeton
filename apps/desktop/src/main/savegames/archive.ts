import fs from "node:fs";
import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as yauzl from "yauzl";
import * as yazl from "yazl";

export const MAX_MANIFEST_BYTES = 96 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024 * 1024;
export const MAX_FILES = 100_000;

export async function copyAndHash(
  source: string | NodeJS.ReadableStream,
  destination?: string,
  maxBytes = MAX_BACKUP_BYTES,
) {
  const hash = createHash("sha256");
  let size = 0;
  const input = typeof source === "string" ? fs.createReadStream(source) : source;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) {
        callback(new Error("La copia supera el tamaño permitido"));
        return;
      }
      hash.update(chunk);
      callback(null, destination ? chunk : undefined);
    },
  });

  if (destination) {
    await pipeline(
      input,
      meter,
      fs.createWriteStream(destination, { flags: "wx", mode: 0o600 }),
    );
  } else {
    meter.resume();
    await pipeline(input, meter);
  }
  return { hash: hash.digest("hex"), size };
}

export async function writeArchive(
  target: string,
  files: Array<{ source: string; name: string }>,
  manifest: unknown,
) {
  const zip = new yazl.ZipFile();
  zip.on("error", (error) => (zip.outputStream as Readable).destroy(error));
  const output = pipeline(
    zip.outputStream,
    fs.createWriteStream(target, { flags: "wx", mode: 0o600 }),
  );

  for (const file of files) {
    zip.addReadStreamLazy(file.name, (callback) =>
      callback(null, fs.createReadStream(file.source)),
    );
  }
  zip.addBuffer(Buffer.from(JSON.stringify(manifest)), "manifest.json");
  zip.end();
  await output;
}

export async function rewriteArchiveManifest(
  sourcePath: string,
  targetPath: string,
  transform: (manifest: unknown) => unknown,
  maxUncompressedBytes = MAX_BACKUP_BYTES,
) {
  return withArchive(sourcePath, maxUncompressedBytes, async (archive) => {
    const manifest = transform(await archive.manifest());
    const zip = new yazl.ZipFile();
    zip.on("error", (error) => (zip.outputStream as Readable).destroy(error));
    const output = pipeline(
      zip.outputStream,
      fs.createWriteStream(targetPath, { flags: "wx", mode: 0o600 }),
    );

    for (const name of archive.entries.keys()) {
      if (name === "manifest.json") {
        continue;
      }
      zip.addReadStreamLazy(name, (callback) => {
        void archive.stream(name).then(
          (stream) => callback(null, stream as Readable),
          (error) => callback(error as Error, null as unknown as Readable),
        );
      });
    }
    zip.addBuffer(Buffer.from(JSON.stringify(manifest)), "manifest.json");
    zip.end();
    await output;
    return manifest;
  });
}

export async function withArchive<T>(
  filePath: string,
  maxBytes: number,
  operation: (archive: {
    entries: Map<string, yauzl.Entry>;
    stream: (name: string) => Promise<NodeJS.ReadableStream>;
    manifest: () => Promise<unknown>;
  }) => Promise<T>,
): Promise<T> {
  const pathInfo = await fs.promises.lstat(filePath);

  if (
    !pathInfo.isFile() ||
    pathInfo.isSymbolicLink() ||
    pathInfo.size > maxBytes + MAX_MANIFEST_BYTES + 16 * 1024 * 1024
  ) {
    throw new Error("El archivo comprimido supera el tamaño permitido");
  }

  const fd = await new Promise<number>((resolve, reject) => {
    fs.open(
      filePath,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
      (error, openedFd) => {
        if (error || openedFd === undefined) {
          reject(error ?? new Error("No se pudo abrir el archivo comprimido"));
          return;
        }
        resolve(openedFd);
      },
    );
  });
  let zip: yauzl.ZipFile;

  try {
    const opened = await new Promise<fs.Stats>((resolve, reject) => {
      fs.fstat(fd, (error, stats) => {
        if (error || !stats) {
          reject(error ?? new Error("No se pudo validar el archivo comprimido"));
          return;
        }
        resolve(stats);
      });
    });

    if (
      !opened.isFile() ||
      opened.dev !== pathInfo.dev ||
      opened.ino !== pathInfo.ino ||
      opened.size > maxBytes + MAX_MANIFEST_BYTES + 16 * 1024 * 1024
    ) {
      throw new Error("El archivo comprimido cambió durante la validación");
    }
    zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
      yauzl.fromFd(
        fd,
        {
          lazyEntries: true,
          autoClose: false,
          validateEntrySizes: true,
          strictFileNames: true,
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error("Copia no válida"));
            return;
          }
          resolve(result);
        },
      );
    });
  } catch (error) {
    await new Promise<void>((resolve) => fs.close(fd, () => resolve()));
    throw error;
  }

  try {
    const entries = new Map<string, yauzl.Entry>();
    let total = 0;
    await new Promise<void>((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.on("entry", (entry: yauzl.Entry) => {
        const segments = entry.fileName.split("/");
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
        const unsafeName =
          !entry.fileName ||
          entry.fileName.includes("\\") ||
          entry.fileName.startsWith("/") ||
          /^[a-zA-Z]:/.test(entry.fileName) ||
          entry.fileName.endsWith("/") ||
          segments.some((segment) => !segment || segment === "." || segment === "..");

        if (entry.fileName !== "manifest.json") {
          total += entry.uncompressedSize;
        }
        if (
          unsafeName ||
          mode === 0o120000 ||
          entries.has(entry.fileName) ||
          entries.size >= MAX_FILES ||
          total > maxBytes ||
          (entry.fileName === "manifest.json" &&
            entry.uncompressedSize > MAX_MANIFEST_BYTES)
        ) {
          reject(
            new Error("La copia contiene entradas duplicadas o supera los límites"),
          );
          return;
        }
        entries.set(entry.fileName, entry);
        zip.readEntry();
      });
      zip.readEntry();
    });
    const stream = (name: string) =>
      new Promise<NodeJS.ReadableStream>((resolve, reject) => {
        const entry = entries.get(name);

        if (!entry) {
          reject(new Error(`Falta un archivo de la copia: ${name}`));
          return;
        }
        zip.openReadStream(entry, (error, input) => {
          if (error || !input) {
            reject(error ?? new Error("No se pudo leer la copia"));
            return;
          }
          resolve(input);
        });
      });
    return await operation({
      entries,
      stream,
      manifest: async () => {
        const input = await stream("manifest.json");
        const chunks: Buffer[] = [];
        let size = 0;

        for await (const chunk of input) {
          size += chunk.length;
          if (size > MAX_MANIFEST_BYTES) {
            throw new Error("Manifiesto demasiado grande");
          }
          chunks.push(Buffer.from(chunk));
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      },
    });
  } finally {
    zip.close();
  }
}
