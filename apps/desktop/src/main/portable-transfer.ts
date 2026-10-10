import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PortableData, PortablePackage } from "../shared/portable-data.js";
import { portableDataSchema, portablePackageSchema } from "../shared/portable-data.js";
import { copyAndHash, withArchive, writeArchive } from "./savegames/archive.js";
import type { SavegameManager } from "./savegames.js";

export const MAX_PORTABLE_BYTES = 100 * 1024 * 1024;
export const MAX_PORTABLE_ARTWORK_BYTES = 50 * 1024 * 1024;
export const MAX_PORTABLE_BACKUPS_BYTES = 40 * 1024 * 1024;

type PreparedPortableImport = {
  data: PortableData;
  assets: Map<string, string>;
  backups: Array<{
    gameKey: string;
    versionId: string;
    filePath: string;
    sha256: string;
  }>;
};

export async function writePortableJson(target: string, contents: string) {
  const temporary = `${target}.nemeton-${randomUUID()}.tmp`;
  const file = await fs.open(temporary, "wx", 0o600);

  try {
    await file.writeFile(contents, "utf8");
    await file.sync();
    await file.close();
    await fs.link(temporary, target);
  } finally {
    await file.close().catch(() => undefined);
    await fs.unlink(temporary).catch(() => undefined);
  }
}

export async function writePortablePackage(
  target: string,
  portable: PortablePackage,
  sources: Map<string, string>,
) {
  const manifest = JSON.stringify(portable);

  if (Buffer.byteLength(manifest, "utf8") > MAX_PORTABLE_BYTES) {
    throw new Error("The export is larger than the 100 MB safety limit.");
  }

  const temporary = `${target}.nemeton-${randomUUID()}.tmp`;
  const files = [...sources].map(([name, source]) => ({ source, name }));

  try {
    await writeArchive(temporary, files, portable);
    const stat = await fs.stat(temporary);

    if (stat.size > MAX_PORTABLE_BYTES) {
      throw new Error("The portable package is larger than the 100 MB safety limit.");
    }
    await fs.link(temporary, target);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}

export async function readPortableImport(
  filePath: string,
  stagingDirectory: string,
  savegameManager: SavegameManager,
): Promise<PreparedPortableImport> {
  const info = await fs.lstat(filePath);

  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_PORTABLE_BYTES) {
    throw new Error(
      "The selected file is not a supported Nemeton export or exceeds 100 MB.",
    );
  }

  const extension = path.extname(filePath).toLocaleLowerCase();

  if (extension === ".json") {
    return {
      data: portableDataSchema.parse(
        JSON.parse(
          (await readBoundedRegularFile(filePath, MAX_PORTABLE_BYTES)).toString("utf8"),
        ),
      ),
      assets: new Map(),
      backups: [],
    };
  }
  if (extension !== ".zip" && extension !== ".nemeton") {
    throw new Error("Choose a Nemeton JSON export or portable package.");
  }

  return withArchive(filePath, MAX_PORTABLE_BYTES, async (archive) => {
    const portable = portablePackageSchema.parse(await archive.manifest());
    const expectedPaths = new Set([
      "manifest.json",
      ...portable.assets.map((asset) => asset.path),
      ...portable.backups.map((backup) => backup.path),
    ]);

    if (
      expectedPaths.size !== archive.entries.size ||
      [...archive.entries.keys()].some((name) => !expectedPaths.has(name))
    ) {
      throw new Error("The package contains unlisted files.");
    }

    const gameKeys = new Set(
      portable.data.library.games.map((game) => `${game.source}:${game.sourceId}`),
    );
    const assets = new Map<string, string>();
    let artworkBytes = 0;

    for (const [index, asset] of portable.assets.entries()) {
      const target = path.join(stagingDirectory, `artwork-${index}${asset.extension}`);
      const result = await copyAndHash(
        await archive.stream(asset.path),
        target,
        asset.size,
      );

      if (
        result.hash !== asset.sha256 ||
        result.size !== asset.size ||
        !(await isImage(target, asset.extension))
      ) {
        throw new Error(`Artwork failed validation: ${asset.path}`);
      }
      artworkBytes += result.size;
      if (artworkBytes > MAX_PORTABLE_ARTWORK_BYTES) {
        throw new Error("Artwork exceeds the 50 MB package limit.");
      }
      assets.set(`${asset.source}:${asset.sourceId}`, target);
    }

    const backups: PreparedPortableImport["backups"] = [];
    let backupBytes = 0;

    for (const [index, backup] of portable.backups.entries()) {
      if (!gameKeys.has(backup.gameKey) || !backup.gameKey.startsWith("local:")) {
        throw new Error("A save backup does not belong to a local library game.");
      }

      const target = path.join(stagingDirectory, `save-backup-${index}.zip`);
      const result = await copyAndHash(
        await archive.stream(backup.path),
        target,
        backup.size,
      );

      if (result.hash !== backup.sha256 || result.size !== backup.size) {
        throw new Error(`Save backup failed its package hash: ${backup.path}`);
      }
      await savegameManager.validatePortableBackupArchive(target, backup.versionId);
      backupBytes += result.size;
      if (backupBytes > MAX_PORTABLE_BACKUPS_BYTES) {
        throw new Error("Save backups exceed the 40 MB package limit.");
      }
      backups.push({ ...backup, filePath: target });
    }
    return { data: portable.data, assets, backups };
  });
}

export async function hashFile(filePath: string, maxBytes: number) {
  const info = await fs.lstat(filePath);

  if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) {
    throw new Error("The file is not regular or exceeds the supported size.");
  }

  const handle = await fs.open(
    filePath,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );

  try {
    const opened = await handle.stat();

    if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino) {
      throw new Error("The file changed while it was being hashed.");
    }

    const hash = createHash("sha256");
    let size = 0;

    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      size += chunk.length;
      if (size > maxBytes) {
        throw new Error("The file exceeds the supported size.");
      }
      hash.update(chunk);
    }
    if (size !== opened.size) {
      throw new Error("The file changed while it was being hashed.");
    }
    return { hash: hash.digest("hex"), size };
  } finally {
    await handle.close();
  }
}

export async function imageSha256(filePath: string, maxBytes: number) {
  const stat = await fs.lstat(filePath);

  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 1 ||
    stat.size > maxBytes
  ) {
    throw new Error("Artwork exceeds the supported size or is not a regular file.");
  }

  const handle = await fs.open(
    filePath,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );

  try {
    const opened = await handle.stat();

    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino) {
      throw new Error("Artwork changed while it was being validated.");
    }

    const hash = createHash("sha256");
    let size = 0;

    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      size += chunk.length;
      if (size > maxBytes) {
        throw new Error("Artwork exceeds the supported size.");
      }
      hash.update(chunk);
    }
    if (size !== opened.size || size < 1) {
      throw new Error("Artwork changed while it was being validated.");
    }
    return { size, sha256: hash.digest("hex") };
  } finally {
    await handle.close();
  }
}

export async function readBoundedRegularFile(filePath: string, maxBytes: number) {
  const info = await fs.lstat(filePath);

  if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) {
    throw new Error("The selected file is not a supported regular file.");
  }

  const handle = await fs.open(
    filePath,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );

  try {
    const opened = await handle.stat();

    if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino) {
      throw new Error("The selected file changed while it was being opened.");
    }

    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      size += chunk.length;
      if (size > maxBytes) {
        throw new Error("The selected file exceeds the supported size.");
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks, size);
  } finally {
    await handle.close();
  }
}

async function isImage(filePath: string, extension: string) {
  const handle = await fs.open(filePath, "r");

  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);

    if (extension === ".png") {
      return (
        bytes.length >= 8 &&
        bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      );
    }
    if (extension === ".jpg" || extension === ".jpeg") {
      return (
        bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      );
    }
    return (
      extension === ".webp" &&
      bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    );
  } finally {
    await handle.close();
  }
}
