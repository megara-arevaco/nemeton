import fs from "node:fs";
import path from "node:path";
import type { SavegameSuggestion } from "../savegames.js";

export class SavegameDiscovery {
  private readonly suggestionCache = new Map<
    string,
    { expiresAt: number; suggestions: SavegameSuggestion[] }
  >();
  constructor(
    private readonly readConfig: () => Promise<{ learned?: Record<string, string[]> }>,
  ) {}
  clearCache() {
    this.suggestionCache.clear();
  }
  async captureActivity(roamingAppData: string) {
    const profile = path.dirname(path.dirname(roamingAppData));
    const roots = [
      path.join(profile, "Documents"),
      path.join(profile, "Saved Games"),
      roamingAppData,
      path.join(path.dirname(roamingAppData), "Local"),
      path.join(path.dirname(roamingAppData), "LocalLow"),
    ];
    const snapshot = new Map<string, number>();
    let visited = 0;
    const walk = async (directory: string, depth: number): Promise<void> => {
      if (visited++ >= 2_500 || depth > 3) {
        return;
      }

      const entries = await fs.promises
        .readdir(directory, { withFileTypes: true })
        .catch(() => []);

      for (const entry of entries) {
        if (/^\.|^(cache|logs?|temp|tmp|node_modules)$/i.test(entry.name)) {
          continue;
        }

        const absolute = path.join(directory, entry.name);

        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          await walk(absolute, depth + 1);
        } else if (entry.isFile()) {
          const info = await fs.promises.stat(absolute).catch(() => null);

          if (info) {
            snapshot.set(absolute, info.mtimeMs);
          }
        }
      }
    };

    for (const root of roots) {
      await walk(root, 0);
    }
    return snapshot;
  }

  async suggestPaths(
    gameTitle: string,
    roamingAppData: string,
    executablePath = "",
    steamAppId?: string | null,
    ludusavi?: { name: string; files: Array<{ path: string; tags: string[] }> } | null,
    includeConfig = false,
    scanHeuristics = true,
  ): Promise<SavegameSuggestion[]> {
    const cacheKey = JSON.stringify([
      gameTitle,
      roamingAppData,
      executablePath,
      steamAppId,
      ludusavi?.name,
      includeConfig,
      scanHeuristics,
    ]);
    const cached = this.suggestionCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.suggestions;
    }

    const profile = path.dirname(path.dirname(roamingAppData));
    const executableDirectory = executablePath ? path.dirname(executablePath) : "";
    const roots = [
      ...new Set(
        [
          path.join(profile, "Documents", "My Games"),
          path.join(profile, "Saved Games"),
          path.join(profile, "Documents"),
          roamingAppData,
          path.join(path.dirname(roamingAppData), "Local"),
          path.join(path.dirname(roamingAppData), "LocalLow"),
          executableDirectory,
        ]
          .filter(Boolean)
          .map((item) => path.resolve(item)),
      ),
    ];
    const normalize = (value: string) =>
      value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
    const titleParts = gameTitle
      .split(/[:\-–—|()\[\]]/)
      .map(normalize)
      .filter((item) => item.length >= 5);
    const executableName = executablePath
      ? normalize(path.basename(executablePath, path.extname(executablePath)))
      : "";
    const identifiers = [
      ...new Set(
        [normalize(gameTitle), ...titleParts, executableName, steamAppId ?? ""].filter(
          (item) => item.length >= 4,
        ),
      ),
    ];
    const saveExtensions = new Set([
      ".sav",
      ".save",
      ".dat",
      ".bin",
      ".slot",
      ".profile",
      ".json",
    ]);
    const found = new Map<string, SavegameSuggestion>();
    const learned = (await this.readConfig()).learned?.[gameTitle] ?? [];

    for (const learnedPath of learned) {
      const info = await fs.promises.stat(learnedPath).catch(() => null);

      if (
        info?.isDirectory() &&
        /(^|[\\/])(save|saves|savegames?|saved games)([\\/]|$)/i.test(learnedPath)
      ) {
        found.set(learnedPath, {
          path: learnedPath,
          confidence: "high",
          reason: "Archivos de partida modificados mientras jugabas",
        });
      }
    }

    let visited = 0;

    if (ludusavi) {
      const replacements: Record<string, string> = {
        "<home>": profile,
        "<winAppData>": roamingAppData,
        "<winLocalAppData>": path.join(path.dirname(roamingAppData), "Local"),
        "<winLocalAppDataLow>": path.join(path.dirname(roamingAppData), "LocalLow"),
        "<winDocuments>": path.join(profile, "Documents"),
        "<winPublic>": path.join(path.dirname(profile), "Public"),
        "<winProgramData>": path.join(path.parse(profile).root, "ProgramData"),
        "<osUserName>": path.basename(profile),
        "<base>": executableDirectory,
        "<root>": executableDirectory ? path.dirname(executableDirectory) : "",
        "<game>": ludusavi.name,
        "<storeGameId>": steamAppId ?? "",
        "<storeUserId>": "*",
      };

      for (const manifestFile of ludusavi.files) {
        if (
          !includeConfig &&
          manifestFile.tags.includes("config") &&
          !manifestFile.tags.includes("save")
        ) {
          continue;
        }

        const manifestPath = manifestFile.path;

        if (
          (manifestPath.includes("<base>") || manifestPath.includes("<root>")) &&
          !executableDirectory
        ) {
          continue;
        }

        let resolved = manifestPath;

        for (const [placeholder, value] of Object.entries(replacements)) {
          resolved = resolved.replaceAll(placeholder, value);
        }
        if (!resolved || /<[^>]+>/.test(resolved)) {
          continue;
        }
        resolved = path.resolve(resolved.replaceAll("/", path.sep));
        const allowed = [...roots, profile].some(
          (root) =>
            resolved === path.resolve(root) ||
            resolved.startsWith(`${path.resolve(root)}${path.sep}`),
        );

        if (!allowed) {
          continue;
        }

        const matches: string[] = [];

        if (/[*?{}[\]]/.test(resolved)) {
          for await (const match of fs.promises.glob(resolved)) {
            matches.push(match);
            if (matches.length >= 100) {
              break;
            }
          }
        } else {
          matches.push(resolved);
        }
        for (const match of matches) {
          const info = await fs.promises.stat(match).catch(() => null);
          const directory = info?.isDirectory()
            ? match
            : info?.isFile()
              ? path.dirname(match)
              : null;

          if (directory) {
            found.set(directory, {
              path: directory,
              confidence: "high",
              reason: `Ruta conocida de Ludusavi para ${ludusavi.name}`,
            });
          }
        }
      }
    }

    const inspect = async (
      directory: string,
      depth: number,
      root: string,
    ): Promise<void> => {
      if (visited++ >= 2_000) {
        return;
      }

      const entries = await fs.promises
        .readdir(directory, { withFileTypes: true })
        .catch(() => []);
      const normalizedSegments = path
        .relative(root, directory)
        .split(path.sep)
        .map(normalize);
      const matchingIdentifier = identifiers.find((identifier) =>
        normalizedSegments.some(
          (segment) =>
            segment === identifier ||
            (identifier.length >= 5 &&
              (segment.includes(identifier) || identifier.includes(segment))),
        ),
      );
      const hasSaveFile = entries.some(
        (entry) =>
          entry.isFile() &&
          (saveExtensions.has(path.extname(entry.name).toLowerCase()) ||
            /^(save|slot|profile|checkpoint)/i.test(entry.name)),
      );
      const appIdMatch = Boolean(steamAppId && normalizedSegments.includes(steamAppId));

      if ((matchingIdentifier || appIdMatch) && (hasSaveFile || depth < 2)) {
        const confidence =
          appIdMatch || (matchingIdentifier && hasSaveFile)
            ? "high"
            : hasSaveFile
              ? "medium"
              : "low";
        const reason = appIdMatch
          ? `Coincide con Steam AppID ${steamAppId}`
          : hasSaveFile
            ? "Coincide con el juego y contiene archivos de partida"
            : "El nombre coincide con el juego";
        const candidate = {
          path: directory,
          confidence,
          reason,
        } satisfies SavegameSuggestion;
        const previous = found.get(directory);

        if (
          !previous ||
          ["low", "medium", "high"].indexOf(candidate.confidence) >
            ["low", "medium", "high"].indexOf(previous.confidence)
        ) {
          found.set(directory, candidate);
        }
      }
      if (depth >= 3) {
        return;
      }
      for (const entry of entries) {
        if (
          !entry.isDirectory() ||
          entry.isSymbolicLink() ||
          /^\.|^(cache|logs?|temp|tmp|node_modules)$/i.test(entry.name)
        ) {
          continue;
        }
        await inspect(path.join(directory, entry.name), depth + 1, root);
      }
    };

    if (scanHeuristics) {
      for (const root of roots) {
        await inspect(root, 0, root);
      }
    }

    const rank = { high: 2, medium: 1, low: 0 } as const;
    const suggestions = [...found.values()]
      .sort(
        (a, b) =>
          rank[b.confidence] - rank[a.confidence] || a.path.localeCompare(b.path),
      )
      .slice(0, 20);

    if (this.suggestionCache.size >= 100) {
      this.suggestionCache.clear();
    }
    this.suggestionCache.set(cacheKey, {
      expiresAt: Date.now() + 5 * 60_000,
      suggestions,
    });
    return suggestions;
  }
}
