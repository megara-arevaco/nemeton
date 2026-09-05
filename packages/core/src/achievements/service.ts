import fs from "node:fs";
import path from "node:path";
import { defaultSteamRoots } from "../steam/discovery.js";
import type { GameAchievement, GameAchievements } from "../shared/types.js";
interface SteamAchievement {
  strID?: unknown;
  strName?: unknown;
  strDescription?: unknown;
  strImage?: unknown;
  bAchieved?: unknown;
  rtUnlocked?: unknown;
  flAchieved?: unknown;
  bHidden?: unknown;
}

interface SteamAchievementsData {
  vecHighlight?: unknown;
  vecUnachieved?: unknown;
  vecAchievedHidden?: unknown;
  nTotal?: unknown;
  nAchieved?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const achievementArray = (value: unknown): SteamAchievement[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const toAchievement = (raw: SteamAchievement): GameAchievement | null => {
  if (typeof raw.strID !== "string" || typeof raw.strName !== "string") {
    return null;
  }

  const unixTime = typeof raw.rtUnlocked === "number" ? raw.rtUnlocked : 0;
  return {
    id: raw.strID,
    name: raw.strName,
    description: typeof raw.strDescription === "string" ? raw.strDescription : "",
    imageUrl: typeof raw.strImage === "string" ? raw.strImage : null,
    achieved: raw.bAchieved === true,
    unlockedAt: unixTime > 0 ? new Date(unixTime * 1_000).toISOString() : null,
    globalPercentage: typeof raw.flAchieved === "number" ? raw.flAchieved : null,
    hidden: raw.bHidden === true,
  };
};

export const parseSteamLibraryAchievements = (content: string): GameAchievements => {
  const root: unknown = JSON.parse(content);

  if (!Array.isArray(root)) {
    return { total: 0, unlocked: 0, items: [] };
  }

  const entry = root.find(
    (item): item is [string, Record<string, unknown>] =>
      Array.isArray(item) && item[0] === "achievements" && isRecord(item[1]),
  );
  const data =
    entry && isRecord(entry[1].data) ? (entry[1].data as SteamAchievementsData) : null;

  if (!data) {
    return { total: 0, unlocked: 0, items: [] };
  }

  const byId = new Map<string, GameAchievement>();
  const values = [
    ...achievementArray(data.vecHighlight),
    ...achievementArray(data.vecAchievedHidden),
    ...achievementArray(data.vecUnachieved),
  ];

  for (const value of values) {
    const achievement = toAchievement(value);

    if (!achievement) {
      continue;
    }

    const previous = byId.get(achievement.id);

    if (!previous) {
      byId.set(achievement.id, achievement);
      continue;
    }
    byId.set(achievement.id, {
      ...previous,
      ...achievement,
      description: achievement.description || previous.description,
      imageUrl: achievement.imageUrl ?? previous.imageUrl,
      achieved: previous.achieved || achievement.achieved,
      unlockedAt: achievement.unlockedAt ?? previous.unlockedAt,
      globalPercentage: achievement.globalPercentage ?? previous.globalPercentage,
      hidden: previous.hidden || achievement.hidden,
    });
  }

  const items = [...byId.values()].sort((left, right) => {
    if (left.achieved !== right.achieved) {
      return left.achieved ? -1 : 1;
    }
    return (right.unlockedAt ?? "").localeCompare(left.unlockedAt ?? "");
  });
  const unlocked = items.filter((item) => item.achieved).length;
  return {
    total: typeof data.nTotal === "number" ? data.nTotal : items.length,
    unlocked: typeof data.nAchieved === "number" ? data.nAchieved : unlocked,
    items,
  };
};

export const discoverSteamAchievements = async (
  appId: string,
): Promise<GameAchievements> => {
  if (!/^\d+$/.test(appId)) {
    return { total: 0, unlocked: 0, items: [] };
  }

  const steamRoot = defaultSteamRoots().find(fs.existsSync);

  if (!steamRoot) {
    return { total: 0, unlocked: 0, items: [] };
  }

  const users = await fs.promises
    .readdir(path.join(steamRoot, "userdata"), { withFileTypes: true })
    .catch(() => []);

  for (const user of users) {
    if (!user.isDirectory() || !/^\d+$/.test(user.name)) {
      continue;
    }

    const cachePath = path.join(
      steamRoot,
      "userdata",
      user.name,
      "config/librarycache",
      `${appId}.json`,
    );
    const content = await fs.promises.readFile(cachePath, "utf8").catch(() => null);

    if (!content) {
      continue;
    }
    try {
      const result = parseSteamLibraryAchievements(content);

      if (result.total > 0 || result.items.length > 0) {
        return result;
      }
    } catch {
      /* Ignore a cache file being rewritten by Steam. */
    }
  }
  return { total: 0, unlocked: 0, items: [] };
};

interface GoldbergState {
  earned?: unknown;
  earned_time?: unknown;
}

interface GoldbergSchema {
  name?: unknown;
  displayName?: unknown;
  description?: unknown;
  desc?: unknown;
  hidden?: unknown;
  icon?: unknown;
}

export const parseGoldbergAchievements = (
  stateContent: string,
  schemaContent?: string | null,
  schemaDirectory?: string,
): GameAchievements => {
  const stateRoot: unknown = JSON.parse(stateContent);
  const schemaRoot: unknown = schemaContent ? JSON.parse(schemaContent) : null;
  const states = isRecord(stateRoot) ? stateRoot : {};
  const schemas = Array.isArray(schemaRoot)
    ? new Map(
        schemaRoot
          .filter(isRecord)
          .map((entry) => [
            String(entry.name ?? entry.apiname ?? ""),
            entry as GoldbergSchema,
          ]),
      )
    : new Map<string, GoldbergSchema>();
  const ids = new Set([...Object.keys(states), ...schemas.keys()].filter(Boolean));
  const items = [...ids]
    .map((id): GameAchievement => {
      const state = isRecord(states[id]) ? (states[id] as GoldbergState) : {};
      const schema = schemas.get(id) ?? {};
      const earnedTime = typeof state.earned_time === "number" ? state.earned_time : 0;
      const icon =
        typeof schema.icon === "string" && schema.icon
          ? schemaDirectory
            ? path.join(schemaDirectory, schema.icon)
            : schema.icon
          : null;
      return {
        id,
        name: typeof schema.displayName === "string" ? schema.displayName : id,
        description:
          typeof schema.description === "string"
            ? schema.description
            : typeof schema.desc === "string"
              ? schema.desc
              : "",
        imageUrl: icon,
        achieved: state.earned === true,
        unlockedAt: earnedTime > 0 ? new Date(earnedTime * 1_000).toISOString() : null,
        globalPercentage: null,
        hidden: schema.hidden === true || schema.hidden === 1,
      };
    })
    .sort((left, right) => Number(right.achieved) - Number(left.achieved));
  return {
    totalKnown: schemas.size > 0 && [...ids].every((id) => schemas.has(id)),
    total: items.length,
    unlocked: items.filter((item) => item.achieved).length,
    items,
  };
};

const parseIni = (content: string) => {
  const sections = new Map<string, Record<string, string>>();
  let section = "";

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith(";") || line.startsWith("#")) {
      continue;
    }

    const header = /^\[([^\]]+)]$/.exec(line);

    if (header) {
      section = header[1]!.trim();
      sections.set(section, sections.get(section) ?? {});
      continue;
    }

    const pair = /^([^=]+)=(.*)$/.exec(line);

    if (!pair) {
      continue;
    }

    const values = sections.get(section) ?? {};
    values[pair[1]!.trim().toLocaleLowerCase()] = pair[2]!.trim();
    sections.set(section, values);
  }
  return sections;
};

export const parseEmulatorIniAchievements = (
  content: string,
  schemaContent?: string | null,
  schemaDirectory?: string,
): GameAchievements => {
  const sections = parseIni(content);
  const states: Record<string, { earned: boolean; earned_time: number }> = {};

  for (const [id, values] of sections) {
    if (!id) {
      continue;
    }

    const achieved =
      values.achieved ?? values.unlocked ?? values.haveachieved ?? values.unlock;

    if (achieved == null) {
      continue;
    }

    const time =
      values.unlocktime ??
      values.unlock_time ??
      values.achievedtime ??
      values.timestamp ??
      "0";
    states[id] = {
      earned: /^(1|true|yes)$/i.test(achieved),
      earned_time: Number(time) || 0,
    };
  }
  return parseGoldbergAchievements(
    JSON.stringify(states),
    schemaContent,
    schemaDirectory,
  );
};

interface LocalAchievementCandidate {
  source: string;
  filePath: string;
  format: "json" | "ini";
}

export interface GoldbergAchievementState {
  appId: string;
  modifiedAt: number;
}

export type GoldbergAchievementStateSnapshot = Map<string, GoldbergAchievementState>;

const goldbergStateDirectories = ["GSE Saves", "Goldberg SteamEmu Saves"];
const goldbergStateFiles = ["achievements.json", "playtime.txt"];

const stateModifiedAt = async (directory: string): Promise<number | null> => {
  const files = await Promise.all(
    goldbergStateFiles.map((file) =>
      fs.promises.stat(path.join(directory, file)).catch(() => null),
    ),
  );
  const timestamps = files
    .filter((file): file is fs.Stats => file !== null)
    .map((file) => file.mtimeMs);

  return timestamps.length ? Math.max(...timestamps) : null;
};

export const snapshotGoldbergAchievementState = async (
  roamingAppData: string,
): Promise<GoldbergAchievementStateSnapshot> => {
  const snapshot: GoldbergAchievementStateSnapshot = new Map();

  await Promise.all(
    goldbergStateDirectories.map(async (folder) => {
      const root = path.join(roamingAppData, folder);
      const directories = await fs.promises
        .readdir(root, { withFileTypes: true })
        .catch(() => []);

      await Promise.all(
        directories
          .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
          .map(async (entry) => {
            const modifiedAt = await stateModifiedAt(path.join(root, entry.name));

            if (modifiedAt !== null) {
              snapshot.set(`${folder}:${entry.name}`, {
                appId: entry.name,
                modifiedAt,
              });
            }
          }),
      );
    }),
  );
  return snapshot;
};

export const findChangedGoldbergAchievementStateId = async (
  before: GoldbergAchievementStateSnapshot,
  roamingAppData: string,
): Promise<string | null> => {
  const after = await snapshotGoldbergAchievementState(roamingAppData);
  const changed = [...after]
    .filter(([key, state]) => state.modifiedAt > (before.get(key)?.modifiedAt ?? 0))
    .map(([, state]) => state)
    .sort((left, right) => right.modifiedAt - left.modifiedAt);

  return changed[0]?.appId ?? null;
};

const localAchievementCandidates = (
  appId: string,
  gameDirectory: string,
  roamingAppData: string,
): LocalAchievementCandidate[] => {
  const profile = path.dirname(path.dirname(roamingAppData));
  const publicDocuments = path.join(path.dirname(profile), "Public", "Documents");
  const programData = path.resolve(profile, "..", "..", "ProgramData");
  const documents = path.join(profile, "Documents");
  const localAppData = path.join(path.dirname(roamingAppData), "Local");
  return [
    ...["GSE Saves", "Goldberg SteamEmu Saves"].map((folder) => ({
      source: "Goldberg/GSE",
      filePath: path.join(roamingAppData, folder, appId, "achievements.json"),
      format: "json" as const,
    })),
    {
      source: "CODEX",
      filePath: path.join(publicDocuments, "Steam", "CODEX", appId, "achievements.ini"),
      format: "ini",
    },
    {
      source: "CODEX",
      filePath: path.join(roamingAppData, "Steam", "CODEX", appId, "achievements.ini"),
      format: "ini",
    },
    {
      source: "RUNE",
      filePath: path.join(publicDocuments, "Steam", "RUNE", appId, "achievements.ini"),
      format: "ini",
    },
    {
      source: "OnlineFix",
      filePath: path.join(
        publicDocuments,
        "OnlineFix",
        appId,
        "Stats",
        "Achievements.ini",
      ),
      format: "ini",
    },
    {
      source: "OnlineFix",
      filePath: path.join(publicDocuments, "OnlineFix", appId, "Achievements.ini"),
      format: "ini",
    },
    {
      source: "EMPRESS",
      filePath: path.join(
        roamingAppData,
        "EMPRESS",
        "remote",
        appId,
        "achievements.json",
      ),
      format: "json",
    },
    {
      source: "CreamAPI",
      filePath: path.join(
        roamingAppData,
        "CreamAPI",
        appId,
        "stats",
        "CreamAPI.Achievements.cfg",
      ),
      format: "ini",
    },
    {
      source: "SmartSteamEmu",
      filePath: path.join(
        roamingAppData,
        "SmartSteamEmu",
        appId,
        "User",
        "Achievements.ini",
      ),
      format: "ini",
    },
    {
      source: "SKIDROW",
      filePath: path.join(
        documents,
        "SKIDROW",
        appId,
        "SteamEmu",
        "UserStats",
        "achiev.ini",
      ),
      format: "ini",
    },
    {
      source: "SKIDROW",
      filePath: path.join(
        localAppData,
        "SKIDROW",
        appId,
        "SteamEmu",
        "UserStats",
        "achiev.ini",
      ),
      format: "ini",
    },
    {
      source: "RLD",
      filePath: path.join(programData, "RLD!", appId, "achievements.ini"),
      format: "ini",
    },
    {
      source: "Juego",
      filePath: path.join(gameDirectory, "achievements.ini"),
      format: "ini",
    },
    {
      source: "Juego",
      filePath: path.join(gameDirectory, "steam_settings", "achievements.ini"),
      format: "ini",
    },
  ];
};

export const discoverGoldbergAchievements = async (
  appId: string,
  executablePath: string,
  roamingAppData: string,
): Promise<GameAchievements> => {
  if (!/^\d+$/.test(appId)) {
    return {
      total: 0,
      unlocked: 0,
      items: [],
      source: null,
      statePath: null,
      status: "missing-app-id",
    };
  }

  const gameDirectory = executablePath ? path.dirname(executablePath) : "";
  const schemaCandidates = gameDirectory
    ? [
        path.join(gameDirectory, "steam_settings", "achievements.json"),
        path.join(gameDirectory, "steam_settings", "configs.app", "achievements.json"),
        path.join(path.dirname(gameDirectory), "steam_settings", "achievements.json"),
      ]
    : [];
  const candidate = localAchievementCandidates(
    appId,
    gameDirectory,
    roamingAppData,
  ).find((item) => fs.existsSync(item.filePath));

  if (!candidate) {
    return {
      total: 0,
      unlocked: 0,
      items: [],
      source: null,
      statePath: null,
      status: "no-state",
    };
  }

  const schemaPath = schemaCandidates.find(fs.existsSync);

  try {
    const [state, schema] = await Promise.all([
      fs.promises.readFile(candidate.filePath, "utf8"),
      schemaPath ? fs.promises.readFile(schemaPath, "utf8") : Promise.resolve(null),
    ]);
    const result =
      candidate.format === "json"
        ? parseGoldbergAchievements(
            state,
            schema,
            schemaPath ? path.dirname(schemaPath) : undefined,
          )
        : parseEmulatorIniAchievements(
            state,
            schema,
            schemaPath ? path.dirname(schemaPath) : undefined,
          );
    return {
      ...result,
      source: candidate.source,
      statePath: candidate.filePath,
      status: "detected",
    };
  } catch {
    return {
      total: 0,
      unlocked: 0,
      items: [],
      source: candidate.source,
      statePath: candidate.filePath,
      status: "parse-error",
    };
  }
};

export const discoverLocalSteamAppId = async (
  executablePath: string,
): Promise<string | null> => {
  if (!executablePath) {
    return null;
  }

  let directory = path.dirname(executablePath);

  for (let depth = 0; depth < 4; depth += 1) {
    const candidates = [
      path.join(directory, "steam_appid.txt"),
      path.join(directory, "steam_settings", "steam_appid.txt"),
      path.join(directory, "steam_settings", "configs.app.ini"),
      path.join(directory, "steam_settings", "configs.app", "configs.app.ini"),
    ];

    for (const candidate of candidates) {
      const content = await fs.promises.readFile(candidate, "utf8").catch(() => null);

      if (!content) {
        continue;
      }

      const direct = content.trim().match(/^\d+$/)?.[0];
      const configured = content.match(
        /(?:^|\n)\s*(?:app_?id|steam_?appid)\s*=\s*(\d+)/i,
      )?.[1];

      if (direct || configured) {
        return direct ?? configured ?? null;
      }
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      break;
    }
    directory = parent;
  }
  return null;
};
