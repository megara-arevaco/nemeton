import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  LibraryStore,
  LibraryGame,
  LocalGameInput,
  LocalGameAssets,
} from "@launcher/core";
import type {
  LocalFolderCandidate,
  LocalFolderScan,
  LocalFolderSelection,
  LocalFolderImportResult,
} from "../shared/local-folder.js";

const ignoredDirectories = new Set([
  "node_modules",
  "engine",
  "redist",
  "_commonredist",
  "redistributables",
  "__installer",
  "directx",
  "dotnet",
  "support",
  "tools",
  "prerequisites",
  "installers",
  "$recycle.bin",
  "system volume information",
  "windows",
]);

const binaryDirectories = new Set([
  "bin",
  "binaries",
  "win64",
  "win32",
  "x64",
  "x86",
  "linux",
  "linux64",
  "build",
]);

const helper =
  /^(?:unins\d*|uninstall(?:er)?|setup|install(?:er)?|vcredist|vc_redist|dxsetup|crashreport(?:er|client)?|crashpad|unitycrashhandler|ue4prereqsetup|easyanticheat|eac_launcher|battleye|dotnet|updater|update)(?:[._ -]|\d|$)/i;

const normalize = (value: string) =>
  process.platform === "win32"
    ? path.resolve(value).toLowerCase()
    : path.resolve(value);

const inside = (root: string, value: string) => {
  const relative = path.relative(root, value);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
};

const cleanTitle = (value: string) =>
  value
    .replace(/(?:[-_ ](?:win(?:32|64)|x(?:86|64)|shipping|release))+$/i, "")
    .replace(/[_]+/g, " ")
    .trim();

function score(executable: string, directory: string) {
  const stem = cleanTitle(
    path.basename(executable, path.extname(executable)),
  ).toLowerCase();
  const folder = cleanTitle(path.basename(directory)).toLowerCase();
  return (
    (stem === folder ? 100 : stem.includes(folder) ? 50 : 0) +
    (/shipping/i.test(executable) ? 10 : 0) -
    (/launcher/i.test(stem) ? 30 : 0) -
    path.relative(directory, executable).split(path.sep).length
  );
}

export async function discoverLocalFolder(
  directory: string,
  existing: LibraryGame[],
): Promise<Omit<LocalFolderScan, "scanId">> {
  const root = await fs.realpath(directory);

  if (!(await fs.stat(root)).isDirectory()) {
    throw new Error("Selecciona una carpeta válida");
  }

  const groups = new Map<string, string[]>();
  const queue = [{ directory: root, depth: 0 }];
  let visited = 0,
    entriesSeen = 0,
    truncated = false,
    unreadableDirectories = 0;

  while (queue.length) {
    const current = queue.shift()!;

    if (++visited > 5000) {
      truncated = true;
      break;
    }

    const entries = await fs
      .readdir(current.directory, { withFileTypes: true })
      .catch(() => {
        unreadableDirectories++;
        return [];
      });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (++entriesSeen > 50000) {
        truncated = true;
        break;
      }
      if (entry.isSymbolicLink() || entry.name.startsWith(".")) {
        continue;
      }

      const filename = path.join(current.directory, entry.name);

      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name.toLowerCase())) {
          continue;
        }
        if (current.depth >= 7) {
          truncated = true;
          continue;
        }
        if (queue.length + visited >= 5000) {
          truncated = true;
          continue;
        }
        queue.push({ directory: filename, depth: current.depth + 1 });
      } else if (entry.isFile()) {
        const extension = path.extname(entry.name).toLowerCase();

        if (helper.test(path.basename(entry.name, extension))) {
          continue;
        }

        const knownExtension = [".exe", ".bat", ".cmd", ".appimage", ".sh"].includes(
          extension,
        );

        if (
          !knownExtension &&
          !(
            process.platform !== "win32" &&
            !extension &&
            ((await fs.stat(filename).catch(() => null))?.mode ?? 0) & 0o111
          )
        ) {
          continue;
        }

        const relative = path
          .relative(root, current.directory)
          .split(path.sep)
          .filter(Boolean);
        const gameDirectory =
          !relative.length || binaryDirectories.has(relative[0]!.toLowerCase())
            ? root
            : path.join(root, relative[0]!);
        const files = groups.get(gameDirectory) ?? [];

        if (files.length < 32) {
          files.push(filename);
        } else {
          truncated = true;
        }
        groups.set(gameDirectory, files);
        if (groups.size >= 500) {
          truncated = true;
          break;
        }
      }
    }
    if (entriesSeen > 50000 || groups.size >= 500) {
      break;
    }
  }

  const existingPaths = await knownInstallations(existing);
  const candidates: LocalFolderCandidate[] = [...groups]
    .map(([gameDirectory, executables]) => {
      executables.sort(
        (a, b) =>
          score(b, gameDirectory) - score(a, gameDirectory) || a.localeCompare(b),
      );
      const first = executables[0]!;
      const title =
        gameDirectory === root && path.dirname(first) === root
          ? cleanTitle(path.basename(first, path.extname(first)))
          : cleanTitle(path.basename(gameDirectory));
      return {
        id: randomUUID(),
        title: title || path.basename(gameDirectory),
        directory: gameDirectory,
        executables,
        alreadyAdded: executables.some((executable) =>
          isKnown(executable, existingPaths),
        ),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
  return { directory: root, candidates, truncated, unreadableDirectories };
}

async function knownInstallations(games: LibraryGame[]) {
  return Promise.all(
    games
      .filter((game) => game.installPath)
      .map(async (game) => {
        const filename = await fs
          .realpath(game.installPath)
          .catch(() => path.resolve(game.installPath));
        const directory =
          (await fs.stat(filename).catch(() => null))?.isDirectory() ?? false;
        return { filename: normalize(filename), directory };
      }),
  );
}

function isKnown(
  executable: string,
  existing: Array<{ filename: string; directory: boolean }>,
) {
  return existing.some((item) =>
    item.directory
      ? inside(item.filename, normalize(executable))
      : item.filename === normalize(executable),
  );
}

export class LocalFolderImportService {
  private readonly scans = new Map<
    string,
    { result: LocalFolderScan; createdAt: number }
  >();
  constructor(
    private readonly store: Pick<LibraryStore, "read" | "addLocalBatch">,
    private readonly resolveAssets: (
      input: LocalGameInput,
    ) => Promise<LocalGameAssets> = async () => ({}),
  ) {}
  async scan(directory: string): Promise<LocalFolderScan> {
    const result = {
      ...(await discoverLocalFolder(directory, (await this.store.read()).games)),
      scanId: randomUUID(),
    };

    while (this.scans.size >= 3) {
      this.scans.delete(this.scans.keys().next().value!);
    }
    this.scans.set(result.scanId, { result, createdAt: Date.now() });
    return result;
  }
  async import(
    scanId: string,
    selections: LocalFolderSelection[],
  ): Promise<LocalFolderImportResult> {
    const scan = this.scans.get(scanId);

    if (!scan || Date.now() - scan.createdAt > 30 * 60_000) {
      throw new Error("El escaneo ha caducado. Vuelve a elegir la carpeta.");
    }
    if (
      !selections.length ||
      selections.length > 500 ||
      new Set(selections.map((item) => item.candidateId)).size !== selections.length
    ) {
      throw new Error("La selección de juegos no es válida");
    }

    const inputs: LocalGameInput[] = [];
    const existing = await knownInstallations((await this.store.read()).games);
    let skippedCount = 0;

    for (const selection of selections) {
      const candidate = scan.result.candidates.find(
        (item) => item.id === selection.candidateId,
      );

      if (
        !candidate ||
        !candidate.executables.includes(selection.executablePath) ||
        !selection.title.trim() ||
        selection.title.length > 500
      ) {
        throw new Error("Revisa los juegos seleccionados antes de confirmar");
      }

      const info = await fs.lstat(selection.executablePath).catch(() => null);
      const canonical = await fs.realpath(selection.executablePath).catch(() => "");

      if (
        !info?.isFile() ||
        info.isSymbolicLink() ||
        !canonical ||
        normalize(canonical) !== normalize(selection.executablePath) ||
        !inside(scan.result.directory, canonical)
      ) {
        throw new Error(
          "Un ejecutable ya no está disponible en la carpeta escaneada. Vuelve a escanear.",
        );
      }
      if (isKnown(canonical, existing)) {
        skippedCount++;
        continue;
      }
      inputs.push({ title: selection.title.trim(), executablePath: canonical });
      existing.push({ filename: normalize(canonical), directory: false });
    }

    const pending = [...inputs];
    const deadline = Date.now() + 30_000;
    await Promise.all(
      Array.from({ length: Math.min(3, pending.length) }, async () => {
        while (pending.length && Date.now() < deadline) {
          const input = pending.shift()!;
          const assets = await this.resolveAssets(input).catch(() => ({}));
          Object.assign(input, assets);
        }
      }),
    );
    // Recheck after metadata requests: nothing is written if an executable moved.
    for (const input of inputs) {
      const info = await fs.lstat(input.executablePath).catch(() => null);
      const canonical = await fs.realpath(input.executablePath).catch(() => "");

      if (
        !info?.isFile() ||
        info.isSymbolicLink() ||
        !canonical ||
        normalize(canonical) !== normalize(input.executablePath) ||
        !inside(scan.result.directory, canonical)
      ) {
        throw new Error(
          "Un ejecutable ya no está disponible en la carpeta escaneada. Vuelve a escanear.",
        );
      }
    }

    const before = await this.store.read();
    const snapshot = inputs.length ? await this.store.addLocalBatch(inputs) : before;
    const addedCount = snapshot.games.length - before.games.length;
    return {
      snapshot,
      addedCount,
      artworkMissingCount: snapshot.games.filter(
        (game) =>
          !before.games.some((previous) => previous.id === game.id) &&
          (!game.coverUrl || !game.heroUrl),
      ).length,
      skippedCount: skippedCount + inputs.length - addedCount,
    };
  }
}
