import fs from "node:fs";
import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as yauzl from "yauzl";
import * as yazl from "yazl";

export const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
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

export async function withArchive<T>(
  filePath: string,
  maxBytes: number,
  operation: (archive: {
    entries: Map<string, yauzl.Entry>;
    stream: (name: string) => Promise<NodeJS.ReadableStream>;
    manifest: () => Promise<unknown>;
  }) => Promise<T>,
): Promise<T> {
  if (
    (await fs.promises.stat(filePath)).size >
    maxBytes + MAX_MANIFEST_BYTES + 16 * 1024 * 1024
  ) {
    throw new Error("El archivo comprimido supera el tamaño permitido");
  }

  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(
      filePath,
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

  try {
    const entries = new Map<string, yauzl.Entry>();
    let total = 0;
    await new Promise<void>((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.on("entry", (entry: yauzl.Entry) => {
        if (entry.fileName !== "manifest.json") {
          total += entry.uncompressedSize;
        }
        if (
          entries.has(entry.fileName) ||
          entries.size >= MAX_FILES + 1 ||
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
