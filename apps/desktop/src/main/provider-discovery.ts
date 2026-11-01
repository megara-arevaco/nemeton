import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { toLocalPath } from "../shared/system-paths.js";
import type { StoreProvider } from "../shared/providers.js";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

async function json(file: string) {
  const info = await fs.lstat(file).catch(() => null);

  if (!info?.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) {
    return {};
  }
  try {
    return record(JSON.parse(await fs.readFile(file, "utf8")));
  } catch {
    return {};
  }
}

export async function discoverStoreInstallations(
  provider: StoreProvider,
): Promise<Map<string, string>> {
  const found = new Map<string, string>();

  if (provider === "epic") {
    const roots = process.env.NEMETON_EPIC_MANIFESTS
      ? [process.env.NEMETON_EPIC_MANIFESTS]
      : [
          path.join(
            process.env.PROGRAMDATA ?? "C:\\ProgramData",
            "Epic/EpicGamesLauncher/Data/Manifests",
          ),
          "/mnt/c/ProgramData/Epic/EpicGamesLauncher/Data/Manifests",
          "/Users/Shared/Epic Games/EpicGamesLauncher/Data/Manifests",
        ];

    for (const root of roots) {
      const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);

      for (const entry of entries.slice(0, 2000)) {
        if (!entry.isFile() || !entry.name.endsWith(".item")) {
          continue;
        }

        const item = await json(path.join(root, entry.name));

        if (
          typeof item.AppName !== "string" ||
          typeof item.InstallLocation !== "string" ||
          item.bIsIncompleteInstall === true
        ) {
          continue;
        }

        const directory = toLocalPath(item.InstallLocation);

        if ((await fs.stat(directory).catch(() => null))?.isDirectory()) {
          found.set(item.AppName, directory);
        }
      }
    }
  } else {
    const roots = process.env.NEMETON_GOG_ROOT
      ? [process.env.NEMETON_GOG_ROOT]
      : [
          "C:\\GOG Games",
          path.join(
            process.env.ProgramFiles ?? "C:\\Program Files",
            "GOG Galaxy/Games",
          ),
          path.join(os.homedir(), "GOG Games"),
          "/mnt/c/GOG Games",
          "/Applications",
        ];
    const visit = async (directory: string, depth: number) => {
      const entries = await fs
        .readdir(directory, { withFileTypes: true })
        .catch(() => []);

      for (const entry of entries.slice(0, 512)) {
        if (entry.isFile() && /^goggame-\d+\.info$/.test(entry.name)) {
          const item = await json(path.join(directory, entry.name));
          const id = String(item.gameId ?? item.rootGameId ?? "");

          if (/^\d{1,20}$/.test(id)) {
            found.set(id, directory);
          }
        } else if (entry.isDirectory() && !entry.isSymbolicLink() && depth < 2) {
          await visit(path.join(directory, entry.name), depth + 1);
        }
      }
    };

    for (const root of roots) {
      await visit(root, 0);
    }
  }
  return found;
}
