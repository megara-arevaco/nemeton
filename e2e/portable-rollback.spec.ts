import { test, expect } from "./fixtures";
import fs from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pipeline } from "node:stream/promises";

const require = createRequire(path.resolve("apps/desktop/package.json"));

type ZipWriter = {
  outputStream: NodeJS.ReadableStream;
  addBuffer(bytes: Buffer, name: string, options?: { compress?: boolean }): void;
  end(): void;
};

test.use({ gameCount: 1 });

test("a mid-commit package failure rolls back library and policies, preserving all recovery copies", async ({
  desktop,
}) => {
  const { app, page, directory } = desktop;
  const dataDirectory = path.join(directory, "data");
  const games = await page.evaluate(() => window.launcher.listGames());
  const game = games.games[0]!;
  await page.evaluate((gameId) => window.launcher.getSavegames(gameId), game.id);
  const originalLibrary = await fs.readFile(path.join(dataDirectory, "library.json"));
  const originalPolicies = await fs.readFile(
    path.join(dataDirectory, "savegames.json"),
  );
  const covers = path.join(dataDirectory, "covers");
  await fs.mkdir(covers, { recursive: true });
  const assetPath = "assets/covers/rollback-fixture.png";
  const asset = Buffer.alloc(8 * 1024 * 1024);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(asset);
  const hash = createHash("sha256").update(asset).digest("hex");
  const portable = {
    format: "nemeton-portable-package",
    version: 1,
    exportedAt: "2025-04-05T12:00:00.000Z",
    data: {
      format: "nemeton-portable-data",
      version: 1,
      exportedAt: "2025-04-05T12:00:00.000Z",
      preferences: { language: "es", accentTheme: "forest" },
      library: {
        version: 1,
        games: [
          {
            id: "rollback-import-id",
            source: game.source,
            sourceId: game.sourceId,
            steamAppId: game.steamAppId ?? null,
            achievementStateId: game.achievementStateId ?? null,
            ludusaviGameName: game.ludusaviGameName ?? null,
            title: "Rollback must not commit",
            coverUrl: null,
            heroUrl: null,
            playtimeMinutes: 0,
            playtimeSecondsRemainder: 0,
            platformPlaytimeMinutes: null,
            trackedPlaytimeSeconds: 0,
            hiddenFromLibrary: false,
            favorite: false,
            backlogStatus: null,
            lastPlayedAt: null,
            importedAt: "2025-04-05T12:00:00.000Z",
            updatedAt: "2025-04-05T12:00:00.000Z",
          },
        ],
        sessions: [],
        excludedGameKeys: [],
      },
      achievementHistory: [],
      savegamePolicies: {
        [`${game.source}:${game.sourceId}`]: {
          autoBackup: false,
          backupBeforeLaunch: false,
          maxVersions: 12,
          maxSizeMb: 1024,
          excludedNames: [],
          exactRestore: false,
          includeConfig: true,
        },
      },
    },
    assets: [
      {
        path: assetPath,
        source: game.source,
        sourceId: game.sourceId,
        extension: ".png",
        size: asset.length,
        sha256: hash,
      },
    ],
    backups: [],
  };
  const packagePath = path.join(directory, "rollback-trigger.zip");
  const yazl = require("yazl") as { ZipFile: new () => ZipWriter };
  const zip = new yazl.ZipFile();
  const output = pipeline(
    zip.outputStream,
    (await import("node:fs")).createWriteStream(packagePath, { flags: "wx" }),
  );
  zip.addBuffer(Buffer.from(JSON.stringify(portable)), "manifest.json", {
    compress: false,
  });
  zip.addBuffer(asset, assetPath, { compress: false });
  zip.end();
  await output;

  let tampered = false;
  const watcher = watch(covers, async (_event, fileName) => {
    if (!tampered && fileName?.toString().startsWith("portable-")) {
      tampered = true;
      await fs.writeFile(
        path.join(dataDirectory, "savegames.json"),
        "{ interrupted fixture write",
      );
    }
  });

  try {
    await app.evaluate(({ dialog }, input) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    }, packagePath);
    await page.getByRole("button", { name: "Ajustes", exact: true }).click();
    await page.getByRole("button", { name: "Importar datos", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "configuración de partidas está dañada",
    );
    expect(
      tampered,
      "test must interrupt the config only after the package asset is staged into the live covers directory",
    ).toBe(true);
  } finally {
    watcher.close();
  }

  expect(await fs.readFile(path.join(dataDirectory, "library.json"))).toEqual(
    originalLibrary,
  );
  expect(await fs.readFile(path.join(dataDirectory, "savegames.json"))).toEqual(
    originalPolicies,
  );
  expect(await fs.readdir(covers)).toEqual([]);
  const dataFiles = await fs.readdir(dataDirectory);
  const libraryBackup = dataFiles.find(
    (name) => name.startsWith("library.json.before-import-") && name.endsWith(".bak"),
  );
  const policyBackup = dataFiles.find(
    (name) => name.startsWith("savegames.json.before-import-") && name.endsWith(".bak"),
  );
  const failedPolicyState = dataFiles.find(
    (name) => name.startsWith("savegames.json.import-failed-") && name.endsWith(".bak"),
  );
  expect(libraryBackup).toBeDefined();
  expect(policyBackup).toBeDefined();
  expect(failedPolicyState).toBeDefined();
  expect(await fs.readFile(path.join(dataDirectory, policyBackup!), "utf8")).toBe(
    originalPolicies.toString("utf8"),
  );
  expect(
    await fs.readFile(path.join(dataDirectory, failedPolicyState!), "utf8"),
  ).toContain("interrupted fixture write");
  expect(await page.evaluate(() => window.launcher.listGames())).toEqual(games);
});
