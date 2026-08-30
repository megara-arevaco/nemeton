import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { SteamCandidate } from "../shared/types.js";

type VdfValue = string | VdfObject;
interface VdfObject {
  [key: string]: VdfValue;
}

const tokenizeVdf = (content: string): string[] => {
  const tokens: string[] = [];
  let cursor = 0;
  while (cursor < content.length) {
    const character = content[cursor];
    if (character && /\s/.test(character)) {
      cursor += 1;
      continue;
    }
    if (character === "/" && content[cursor + 1] === "/") {
      const newline = content.indexOf("\n", cursor + 2);
      if (newline < 0) {
        break;
      }
      cursor = newline + 1;
      continue;
    }
    if (character === "{" || character === "}") {
      tokens.push(character);
      cursor += 1;
      continue;
    }
    if (character !== '"') {
      throw new Error(`Invalid VDF at ${cursor}`);
    }
    cursor += 1;
    let value = "";
    while (cursor < content.length && content[cursor] !== '"') {
      if (content[cursor] === "\\" && content[cursor + 1]) {
        const escaped = content[cursor + 1];
        value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
        cursor += 2;
      } else {
        value += content[cursor];
        cursor += 1;
      }
    }
    if (content[cursor] !== '"') {
      throw new Error("Unclosed VDF string");
    }
    cursor += 1;
    tokens.push(value);
  }
  return tokens;
};

export const parseVdf = (content: string): VdfObject => {
  const tokens = tokenizeVdf(content.replace(/^\uFEFF/, ""));
  let cursor = 0;
  const parseObject = (nested: boolean): VdfObject => {
    const result: VdfObject = {};
    while (cursor < tokens.length) {
      const key = tokens[cursor++];
      if (key === "}") {
        if (!nested) {
          throw new Error("Unexpected VDF brace");
        }
        return result;
      }
      const value = tokens[cursor++];
      if (!key || value === undefined) {
        throw new Error("Incomplete VDF pair");
      }
      result[key] = value === "{" ? parseObject(true) : value;
    }
    if (nested) {
      throw new Error("Unclosed VDF object");
    }
    return result;
  };
  return parseObject(false);
};

const objectValue = (value: VdfValue | undefined): VdfObject | null =>
  value && typeof value === "object" ? value : null;
const stringValue = (value: VdfValue | undefined): string | null =>
  typeof value === "string" ? value : null;
const integerValue = (value: VdfValue | undefined): number | null => {
  const raw = stringValue(value);
  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export const defaultSteamRoots = (): string[] => {
  if (process.platform === "win32") {
    return ["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam"];
  }
  if (process.platform === "darwin") {
    return [path.join(os.homedir(), "Library/Application Support/Steam")];
  }
  return [
    path.join(os.homedir(), ".steam/steam"),
    path.join(os.homedir(), ".local/share/Steam"),
    "/mnt/c/Program Files (x86)/Steam",
    "/mnt/c/Program Files/Steam",
  ];
};

const windowsPathOnWsl = (value: string): string | null => {
  const match = /^([a-z]):[\\/](.*)$/i.exec(value);
  if (!match || !match[1] || !match[2] || !process.env.WSL_DISTRO_NAME) {
    return null;
  }
  return path.posix.join("/mnt", match[1].toLowerCase(), ...match[2].split(/[\\/]+/));
};

const normalizeLibraryPath = (value: string): string | null => {
  const normalized = value.replaceAll("\\\\", "\\");
  return path.isAbsolute(normalized) ? normalized : windowsPathOnWsl(normalized);
};

const libraryFolders = async (steamRoot: string): Promise<string[]> => {
  const config = await fs.promises
    .readFile(path.join(steamRoot, "steamapps/libraryfolders.vdf"), "utf8")
    .catch(() => null);
  const roots = new Set<string>([steamRoot]);
  if (!config) {
    return [...roots];
  }
  const libraries = objectValue(parseVdf(config).libraryfolders);
  if (!libraries) {
    return [...roots];
  }
  for (const entry of Object.values(libraries)) {
    const raw = typeof entry === "string" ? entry : stringValue(entry.path);
    const normalized = raw ? normalizeLibraryPath(raw) : null;
    if (normalized) {
      roots.add(normalized);
    }
  }
  return [...roots];
};

const parseManifest = (content: string, libraryPath: string): SteamCandidate | null => {
  const state = objectValue(parseVdf(content).AppState);
  if (!state) {
    return null;
  }
  const appId = stringValue(state.appid);
  const title = stringValue(state.name);
  const installDir = stringValue(state.installdir);
  if (!appId || !title || !installDir) {
    return null;
  }
  return {
    appId,
    title,
    installPath: path.join(libraryPath, "steamapps/common", installDir),
    libraryPath,
    playtimeMinutes: 0,
    lastPlayedAt: null,
  };
};

const discoverPlaytimes = async (steamRoot: string) => {
  const result = new Map<
    string,
    Pick<SteamCandidate, "playtimeMinutes" | "lastPlayedAt">
  >();
  const userdata = path.join(steamRoot, "userdata");
  const users = await fs.promises
    .readdir(userdata, { withFileTypes: true })
    .catch(() => []);
  for (const user of users) {
    if (!user.isDirectory() || !/^\d+$/.test(user.name)) {
      continue;
    }
    const configPath = path.join(userdata, user.name, "config/localconfig.vdf");
    const content = await fs.promises.readFile(configPath, "utf8").catch(() => null);
    if (!content) {
      continue;
    }
    try {
      const root = objectValue(parseVdf(content).UserLocalConfigStore);
      const software = objectValue(root?.Software);
      const valve = objectValue(software?.Valve);
      const steam = objectValue(valve?.Steam);
      const apps = objectValue(steam?.apps);
      if (!apps) {
        continue;
      }
      for (const [appId, value] of Object.entries(apps)) {
        const app = objectValue(value);
        if (!app || !/^\d+$/.test(appId)) {
          continue;
        }
        const playtimeMinutes = integerValue(app.Playtime) ?? 0;
        const lastPlayed = integerValue(app.LastPlayed);
        const previous = result.get(appId);
        if (!previous || playtimeMinutes > previous.playtimeMinutes) {
          result.set(appId, {
            playtimeMinutes,
            lastPlayedAt: lastPlayed
              ? new Date(lastPlayed * 1_000).toISOString()
              : null,
          });
        }
      }
    } catch {
      /* Steam may be updating this file. */
    }
  }
  return result;
};

export const discoverSteamGames = async (): Promise<SteamCandidate[]> => {
  const steamRoot = defaultSteamRoots().find(fs.existsSync);
  if (!steamRoot) {
    return [];
  }
  const candidates = new Map<string, SteamCandidate>();
  const playtimes = await discoverPlaytimes(steamRoot);
  for (const libraryPath of await libraryFolders(steamRoot)) {
    const steamapps = path.join(libraryPath, "steamapps");
    const entries = await fs.promises.readdir(steamapps).catch(() => []);
    for (const entry of entries.filter((name) =>
      /^appmanifest_\d+\.acf$/i.test(name),
    )) {
      const content = await fs.promises
        .readFile(path.join(steamapps, entry), "utf8")
        .catch(() => null);
      if (!content) {
        continue;
      }
      try {
        const game = parseManifest(content, libraryPath);
        if (game && fs.existsSync(game.installPath)) {
          candidates.set(game.appId, { ...game, ...playtimes.get(game.appId) });
        }
      } catch {
        /* Steam may be writing the manifest while we scan. */
      }
    }
  }
  return [...candidates.values()].sort((a, b) => a.title.localeCompare(b.title));
};
