import { test, expect, launchIsolatedDesktop } from "./fixtures";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pipeline } from "node:stream/promises";
import type { ElectronApplication, Page } from "@playwright/test";

const require = createRequire(path.resolve("apps/desktop/package.json"));

type ZipEntry = { fileName: string };

type ZipReader = {
  on(event: "error", listener: (error: Error) => void): ZipReader;
  on(event: "end", listener: () => void): ZipReader;
  on(event: "entry", listener: (entry: ZipEntry) => void): ZipReader;
  openReadStream(
    entry: ZipEntry,
    callback: (error: Error | null, stream: NodeJS.ReadableStream | null) => void,
  ): void;
  readEntry(): void;
};

type ZipWriter = {
  outputStream: NodeJS.ReadableStream;
  addBuffer(
    bytes: Buffer,
    name: string,
    options?: { mode?: number; compress?: boolean },
  ): void;
  end(): void;
};

const transparentPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pO8AAAAASUVORK5CYII=",
  "base64",
);

async function choosePaths(app: ElectronApplication, paths: string[]) {
  await app.evaluate(({ dialog }, queue) => {
    const remaining = [...queue];
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [remaining.shift()!],
    });
  }, paths);
}

async function readZipEntries(filePath: string) {
  const yauzl = require("yauzl") as {
    open: (
      file: string,
      options: { lazyEntries: boolean; autoClose: boolean },
      callback: (error: Error | null, result: ZipReader | null) => void,
    ) => void;
  };
  const zip = await new Promise<ZipReader>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: true }, (error, result) => {
      if (error || !result) {
        reject(error ?? new Error("Invalid ZIP"));
      } else {
        resolve(result);
      }
    });
  });
  return new Promise<Map<string, Buffer>>((resolve, reject) => {
    const entries = new Map<string, Buffer>();
    zip.on("error", (error) => reject(error));
    zip.on("end", () => resolve(entries));
    zip.on("entry", (entry) => {
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          reject(error ?? new Error("Invalid ZIP stream"));
          return;
        }

        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => {
          entries.set(entry.fileName, Buffer.concat(chunks));
          zip.readEntry();
        });
      });
    });
    zip.readEntry();
  });
}

async function writeZip(
  filePath: string,
  entries: Array<{ name: string; bytes: Buffer; mode?: number }>,
) {
  const yazl = require("yazl") as { ZipFile: new () => ZipWriter };
  const zip = new yazl.ZipFile();
  const output = pipeline(
    zip.outputStream,
    (await import("node:fs")).createWriteStream(filePath, { flags: "wx" }),
  );

  for (const entry of entries) {
    zip.addBuffer(entry.bytes, entry.name, { mode: entry.mode, compress: false });
  }
  zip.end();
  await output;
}

async function setDialogPaths(
  app: ElectronApplication,
  options: { open?: string; save?: string },
) {
  await app.evaluate(({ dialog }, targets) => {
    if (targets.open) {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [targets.open!],
      });
    }
    if (targets.save) {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: targets.save!,
      });
    }
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, options);
}

async function launchImportTarget(root: string, syncFolder: string) {
  const data = path.join(root, "data");
  await fs.mkdir(data, { recursive: true });
  await fs.writeFile(
    path.join(data, "settings.json"),
    JSON.stringify({
      steamId: "fixture-account",
      encryptedSteamApiKey: "dpapi:PORTABLE_SECRET_MUST_NOT_MOVE",
      syncFolderPath: null,
    }),
  );
  const isolated = await launchIsolatedDesktop(root);
  const page = await isolated.app.firstWindow();
  await expect(page.getByRole("navigation")).toBeVisible();
  await setDialogPaths(isolated.app, { open: syncFolder });
  await page.evaluate(() => window.launcher.selectSyncFolder());
  return { ...isolated, page };
}

test("versioned ZIP transfers a local cover and optional validated backup without machine data", async ({
  desktop,
}) => {
  const { app, page, directory } = desktop;
  const executable = path.join(directory, "fixture-game.exe");
  const cover = path.join(directory, "fixture-cover.png");
  const saves = path.join(directory, "fictional-saves");
  const sync = path.join(directory, "fictional-sync");
  const output = path.join(directory, "portable-v1.zip");
  await fs.writeFile(executable, "not an executable; fictional path marker");
  await fs.writeFile(cover, transparentPng);
  await fs.mkdir(saves);
  await fs.mkdir(sync);
  await fs.writeFile(
    path.join(saves, "slot.sav"),
    "fictional portable backup contents",
  );
  const original = path.join(directory, "data", "settings.json");
  const secret = "FIXTURE_STEAM_SECRET_NEVER_EXPORT";
  await fs.writeFile(
    original,
    JSON.stringify({
      steamId: "fixture-account",
      encryptedSteamApiKey: `dpapi:${secret}`,
      syncFolderPath: sync,
    }),
  );
  const created = await page.evaluate(
    ({ executablePath, artworkPath }) =>
      window.launcher.addLocalGame({
        title: "Portable Package Fixture",
        executablePath,
        artworkPath,
      }),
    { executablePath: executable, artworkPath: cover },
  );
  const game = created.games.find((item) => item.title === "Portable Package Fixture")!;
  await page.evaluate((gameId) => window.launcher.getSavegames(gameId), game.id);
  await choosePaths(app, [saves, sync]);
  await page.evaluate(async (gameId) => {
    await window.launcher.addSavegameFolder(gameId);
    await window.launcher.selectSyncFolder();
    await window.launcher.setSavegamePolicy(gameId, { maxVersions: 10 });
    await window.launcher.backupSavegames(gameId);
  }, game.id);

  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page.getByLabel("Formato de exportación").selectOption("package");
  await page.getByLabel("Incluir carátulas locales · 50 MB máx.").check();
  await page.getByLabel("Incluir backups de partidas opcionales · 40 MB máx.").check();
  await setDialogPaths(app, { save: output });
  await page.getByRole("button", { name: "Exportar datos", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Carátulas: 1 · copias de partidas: 1",
  );

  const packageEntries = await readZipEntries(output);
  const manifest = JSON.parse(
    packageEntries.get("manifest.json")!.toString("utf8"),
  ) as {
    format: string;
    version: number;
    data: {
      library: { games: Array<Record<string, unknown>> };
      savegamePolicies: Record<string, { maxVersions: number }>;
    };
    assets: Array<{ path: string; size: number; sha256: string }>;
    backups: Array<{
      path: string;
      gameKey: string;
      versionId: string;
      sha256: string;
    }>;
  };
  expect(manifest).toMatchObject({ format: "nemeton-portable-package", version: 1 });
  expect(manifest.assets).toHaveLength(1);
  expect(manifest.backups).toHaveLength(1);
  expect(packageEntries.has(manifest.assets[0]!.path)).toBe(true);
  expect(packageEntries.has(manifest.backups[0]!.path)).toBe(true);
  const gameData = manifest.data.library.games[0]!;
  expect(gameData).not.toHaveProperty("installPath");
  expect(gameData).not.toHaveProperty("executablePath");
  expect(gameData).not.toHaveProperty("coverPath");
  expect(manifest.data.savegamePolicies[manifest.backups[0]!.gameKey]).toMatchObject({
    maxVersions: 10,
  });
  const manifestText = packageEntries.get("manifest.json")!.toString("utf8");

  for (const forbidden of [secret, executable, cover, saves, sync, directory]) {
    expect(manifestText).not.toContain(forbidden);
  }

  const nestedBackup = path.join(directory, "portable-save.zip");
  await fs.writeFile(nestedBackup, packageEntries.get(manifest.backups[0]!.path)!);
  const nestedEntries = await readZipEntries(nestedBackup);
  const nestedManifest = JSON.parse(
    nestedEntries.get("manifest.json")!.toString("utf8"),
  ) as {
    deviceId: string;
    deviceName: string;
    files: Array<Record<string, unknown>>;
  };
  expect(nestedManifest.deviceId).toBe("portable-package");
  expect(nestedManifest.deviceName).toBe("Portable backup");
  expect(nestedManifest.files[0]).not.toHaveProperty("rootKey");
  expect(JSON.stringify(nestedManifest)).not.toContain(directory);
  expect(JSON.stringify(nestedManifest)).not.toContain(saves);

  const targetRoot = path.join(directory, "target-device");
  const targetSync = path.join(directory, "target-sync");
  await fs.mkdir(targetSync);
  const target = await launchImportTarget(targetRoot, targetSync);
  await target.app.evaluate(({ dialog }, input) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
  }, output);
  await target.page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await target.page
    .getByRole("button", { name: "Importar datos", exact: true })
    .click();
  await expect(target.page.getByRole("status")).toContainText(
    "Carátulas: 1 · copias de partidas: 1",
  );
  const imported = await target.page.evaluate(() => window.launcher.listGames());
  const importedGame = imported.games.find(
    (item) => item.title === "Portable Package Fixture",
  )!;
  expect(importedGame.installPath).toBe("");
  expect(importedGame.coverPath).toMatch(/^portable-[a-f0-9-]+\.png$/);
  const importedCoverPath = path.join(
    target.dataDirectory,
    "covers",
    importedGame.coverPath!,
  );
  expect((await fs.readFile(importedCoverPath)).equals(transparentPng)).toBe(true);
  const importedSavegames = await target.page.evaluate(
    (gameId) => window.launcher.getSavegames(gameId),
    importedGame.id,
  );
  expect(importedSavegames.paths).toEqual([]);
  expect(importedSavegames.policy.maxVersions).toBe(10);
  expect(importedSavegames.versions.map((version) => version.id)).toContain(
    manifest.backups[0]!.versionId,
  );
  await expect(
    target.page.evaluate(
      ({ gameId, versionId }) =>
        window.launcher.verifySavegameVersion(gameId, versionId),
      { gameId: importedGame.id, versionId: manifest.backups[0]!.versionId },
    ),
  ).resolves.toBe("verified");
  expect(
    await fs.readFile(path.join(target.dataDirectory, "settings.json"), "utf8"),
  ).toContain("PORTABLE_SECRET_MUST_NOT_MOVE");
  await target.app.close();
});

test("portable ZIP import rejects traversal, symlink, hash mismatch and oversized files without changes", async ({
  desktop,
}) => {
  const { app, page, directory } = desktop;
  const starting = await page.evaluate(() => window.launcher.listGames());
  const manifest = {
    format: "nemeton-portable-package",
    version: 1,
    exportedAt: "2025-04-05T12:00:00.000Z",
    data: {
      format: "nemeton-portable-data",
      version: 1,
      exportedAt: "2025-04-05T12:00:00.000Z",
      preferences: { language: "es", accentTheme: "forest" },
      library: { version: 1, games: [], sessions: [], excludedGameKeys: [] },
      achievementHistory: [],
      savegamePolicies: {},
    },
    assets: [],
    backups: [],
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const traversal = path.join(directory, "traversal.zip");
  const symlink = path.join(directory, "symlink.zip");
  const gameData = {
    id: "fixture-game-id",
    source: "local",
    sourceId: "fixture-source-id",
    steamAppId: null,
    achievementStateId: null,
    ludusaviGameName: null,
    title: "Hash Fixture",
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
  };
  const damagedManifest = {
    ...manifest,
    data: {
      ...manifest.data,
      library: { ...manifest.data.library, games: [gameData] },
    },
    assets: [
      {
        path: "assets/covers/fixture-game-id.png",
        source: "local",
        sourceId: "fixture-source-id",
        extension: ".png",
        size: transparentPng.length,
        sha256: "0".repeat(64),
      },
    ],
  };
  const badHash = path.join(directory, "bad-hash.zip");
  await writeZip(traversal, [
    { name: "manifest.json", bytes: manifestBytes },
    { name: "assets/x/abcdefghijklmn", bytes: Buffer.from("must not extract") },
  ]);
  const traversalBytes = await fs.readFile(traversal);
  const safeName = Buffer.from("assets/x/abcdefghijklmn");
  const traversalName = Buffer.from("../outside-fixture.json");
  let replacedNames = 0;

  for (
    let offset = 0;
    (offset = traversalBytes.indexOf(safeName, offset)) >= 0;
    offset += safeName.length
  ) {
    traversalName.copy(traversalBytes, offset);
    replacedNames += 1;
  }
  expect(replacedNames).toBe(2);
  await fs.writeFile(traversal, traversalBytes);
  await writeZip(symlink, [
    { name: "manifest.json", bytes: manifestBytes },
    { name: "assets/covers/linked.png", bytes: Buffer.from("link"), mode: 0o120777 },
  ]);
  await writeZip(badHash, [
    { name: "manifest.json", bytes: Buffer.from(JSON.stringify(damagedManifest)) },
    { name: "assets/covers/fixture-game-id.png", bytes: transparentPng },
  ]);

  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  for (const [name, filePath, expected] of [
    ["traversal", traversal, /invalid relative path|entradas|ruta|límites/i],
    ["symlink", symlink, /entradas|simbólico|límites/i],
    ["hash", badHash, /Artwork failed validation/i],
  ] as const) {
    await app.evaluate(({ dialog }, input) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
    }, filePath);
    await page.getByRole("button", { name: "Importar datos", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(expected);
    expect(await page.evaluate(() => window.launcher.listGames())).toEqual(starting);
    expect(
      await fs.stat(path.join(directory, "outside-fixture.json")).catch(() => null),
    ).toBeNull();
    void name;
  }

  const oversized = path.join(directory, "oversized.zip");
  const handle = await fs.open(oversized, "wx");
  await handle.truncate(100 * 1024 * 1024 + 1);
  await handle.close();
  await app.evaluate(({ dialog }, input) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
  }, oversized);
  await page.getByRole("button", { name: "Importar datos", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("100 MB");
  expect(await page.evaluate(() => window.launcher.listGames())).toEqual(starting);
});

test("portable JSON rejects invalid exported IDs and duplicate session IDs", async ({
  desktop,
}) => {
  const { app, page, directory } = desktop;
  const starting = await page.evaluate(() => window.launcher.listGames());
  const timestamp = "2025-04-05T12:00:00.000Z";
  const game = {
    id: "fixture-game-id",
    source: "local",
    sourceId: "fixture-source-id",
    steamAppId: null,
    achievementStateId: null,
    ludusaviGameName: null,
    title: "JSON identifier fixture",
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
    importedAt: timestamp,
    updatedAt: timestamp,
  };
  const base = {
    format: "nemeton-portable-data",
    version: 1,
    exportedAt: timestamp,
    preferences: { language: "es", accentTheme: "forest" },
    library: { version: 1, games: [game], sessions: [], excludedGameKeys: [] },
    achievementHistory: [],
    savegamePolicies: {},
  };
  const invalidId = path.join(directory, "invalid-exported-id.json");
  await fs.writeFile(
    invalidId,
    JSON.stringify({
      ...base,
      library: {
        ...base.library,
        games: [{ ...game, id: "../outside-fixture" }],
      },
    }),
  );
  const duplicateSessions = path.join(directory, "duplicate-session-ids.json");
  const session = {
    id: "session-fixture",
    gameId: game.id,
    startedAt: timestamp,
    endedAt: timestamp,
    durationSeconds: 0,
    origin: "launcher",
  };
  await fs.writeFile(
    duplicateSessions,
    JSON.stringify({
      ...base,
      library: {
        ...base.library,
        sessions: [session, { ...session, gameId: game.id }],
      },
    }),
  );

  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  for (const filePath of [invalidId, duplicateSessions]) {
    await app.evaluate(({ dialog }, input) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
    }, filePath);
    await page.getByRole("button", { name: "Importar datos", exact: true }).click();
    await expect(page.getByRole("status")).not.toContainText("Datos importados");
    expect(await page.evaluate(() => window.launcher.listGames())).toEqual(starting);
  }
});

function contrastRatio(foreground: string, background: string) {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (color: string) => {
    const values = color
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number);
    return (
      0.2126 * channel(values[0]!) +
      0.7152 * channel(values[1]!) +
      0.0722 * channel(values[2]!)
    );
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test.describe("large achievement catalogue", () => {
  test.use({ gameCount: 0 });

  test("shows all entries, keeps locked spoilers hidden, supports filters and keyboard focus across all themes", async ({
    desktop,
  }, testInfo) => {
    const { page, directory } = desktop;
    const gameDirectory = path.join(directory, "fictional-game", "bin");
    const steamSettings = path.join(gameDirectory, "steam_settings");
    const roamingAchievements = path.join(
      directory,
      "roaming-appdata",
      "GSE Saves",
      "876543",
    );
    await fs.mkdir(steamSettings, { recursive: true });
    await fs.mkdir(roamingAchievements, { recursive: true });
    const executable = path.join(gameDirectory, "fictional-game.exe");
    await fs.writeFile(executable, "fictional executable fixture");
    const definitions = Array.from({ length: 120 }, (_, index) => ({
      name: `ACH_${String(index).padStart(3, "0")}`,
      displayName:
        index === 119
          ? "UNLOCKED SECRET FIXTURE"
          : `Fixture achievement ${String(index).padStart(3, "0")}`,
      description:
        index === 119
          ? "Secret detail after unlock"
          : `Fictional achievement detail ${index}`,
      hidden: index === 118 || index === 119,
    }));
    await fs.writeFile(
      path.join(steamSettings, "achievements.json"),
      JSON.stringify(definitions),
    );
    const state = Object.fromEntries(
      definitions.map((item, index) => [
        item.name,
        {
          earned: index < 10 || index === 119,
          earned_time: index < 10 || index === 119 ? 1_700_000_000 + index : 0,
        },
      ]),
    );
    await fs.writeFile(
      path.join(roamingAchievements, "achievements.json"),
      JSON.stringify(state),
    );
    await page.evaluate(
      (executablePath) =>
        window.launcher.addLocalGame({
          title: "Achievement Fixture",
          executablePath,
          steamAppId: "876543",
        }),
      executable,
    );
    await page
      .getByRole("group", { name: "Juegos de la biblioteca" })
      .getByRole("button", { name: /^Achievement Fixture,/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "Achievement Fixture", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("11 de 120 desbloqueados", { exact: true }),
    ).toBeVisible();
    const viewAll = page.getByRole("button", { name: "Ver todos", exact: true });
    await viewAll.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: "Ver destacados", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    const filter = page.getByLabel("Filtrar logros");
    await expect(filter).toBeVisible();
    await filter.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(filter).toHaveValue("unlocked");
    const achievementGrid = page.locator(".achievement-grid");
    await expect(achievementGrid.locator("article")).toHaveCount(11);
    await expect(
      page.getByText("UNLOCKED SECRET FIXTURE", { exact: true }),
    ).toBeVisible();
    await filter.selectOption("locked");
    await expect(achievementGrid.locator("article")).toHaveCount(109);
    await expect(page.getByText("Logro oculto", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText("UNLOCKED SECRET FIXTURE", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Secret detail after unlock", { exact: true }),
    ).toHaveCount(0);

    const themeNames: Array<[string, string]> = [
      ["forest", "Bosque"],
      ["aurora", "Aurora"],
      ["ember", "Brasa"],
      ["amethyst", "Amatista"],
      ["glacier", "Glaciar"],
    ];
    const measurements: Array<{ theme: string; body: number; focus: number }> = [];

    for (const [theme, localizedName] of themeNames) {
      await page.getByRole("button", { name: "Ajustes", exact: true }).click();
      await page.getByRole("button", { name: new RegExp(`^${localizedName}`) }).click();
      await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
      await page
        .getByRole("group", { name: "Juegos de la biblioteca" })
        .getByRole("button", { name: /^Achievement Fixture,/ })
        .click();
      await expect(
        page.getByRole("heading", { name: "Achievement Fixture", exact: true }),
      ).toBeVisible();
      const expand = page.getByRole("button", { name: "Ver todos", exact: true });
      await expand.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".achievement.locked small").first()).toBeVisible();
      const measure = await page.evaluate(() => {
        const text = document.querySelector(".achievement.locked small")!;
        const card = text.closest(".achievement")!;
        const cardBackground = getComputedStyle(card).backgroundColor;
        const surface = getComputedStyle(
          card.closest(".achievements-section")!,
        ).backgroundColor;
        const channels = (color: string) => color.match(/[\d.]+/g)!.map(Number);
        const [cr, cg, cb, alpha = 1] = channels(cardBackground);
        const [sr, sg, sb] = channels(surface);
        const background = `rgb(${Math.round(cr! * alpha! + sr! * (1 - alpha!))}, ${Math.round(cg! * alpha! + sg! * (1 - alpha!))}, ${Math.round(cb! * alpha! + sb! * (1 - alpha!))})`;
        const composite = (color: string, base: string, opacity = 1) => {
          const [r, g, b, colorAlpha = 1] = channels(color);
          const [br, bg, bb] = channels(base);
          const effectiveAlpha = colorAlpha! * opacity;
          return `rgb(${Math.round(r! * effectiveAlpha + br! * (1 - effectiveAlpha))}, ${Math.round(g! * effectiveAlpha + bg! * (1 - effectiveAlpha))}, ${Math.round(b! * effectiveAlpha + bb! * (1 - effectiveAlpha))})`;
        };
        const foreground = composite(
          getComputedStyle(text).color,
          background,
          Number(getComputedStyle(card).opacity),
        );
        const control = document.querySelector(".achievement-control") as HTMLElement;
        control.focus();
        const focusStyle = getComputedStyle(control);
        const focusColor = composite(focusStyle.outlineColor, background);
        return {
          background,
          foreground,
          focusColor,
          focusWidth: focusStyle.outlineWidth,
          focusStyle: focusStyle.outlineStyle,
        };
      });
      const bodyContrast = contrastRatio(measure.foreground, measure.background);
      const focusContrast = contrastRatio(measure.focusColor, measure.background);
      expect(bodyContrast, `${theme} locked text`).toBeGreaterThanOrEqual(4.5);
      expect(focusContrast, `${theme} focus outline`).toBeGreaterThanOrEqual(3);
      expect(measure.focusWidth).toBe("2px");
      expect(measure.focusStyle).toBe("solid");
      measurements.push({ theme, body: bodyContrast, focus: focusContrast });
    }
    expect(measurements).toHaveLength(5);
    await page.getByLabel("Filtrar logros").selectOption("all");
    await expect(achievementGrid.locator("article")).toHaveCount(120);
    const catalogueLayout = await page.evaluate(() => {
      const grid = document.querySelector(".achievement-grid")!;
      const last = grid.lastElementChild!.getBoundingClientRect();
      return {
        count: grid.children.length,
        scrollHeight: grid.scrollHeight,
        clientHeight: grid.clientHeight,
        lastTop: last.top,
      };
    });
    console.info("ACHIEVEMENT_CATALOGUE_LAYOUT", JSON.stringify(catalogueLayout));
    await page.setViewportSize({ width: 960, height: 760 });
    const compactLayout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      appWidth: document.querySelector(".app-shell")!.scrollWidth,
      gridWidth: document.querySelector(".achievement-grid")!.scrollWidth,
      gridClientWidth: document.querySelector(".achievement-grid")!.clientWidth,
    }));
    expect(compactLayout.documentWidth).toBeLessThanOrEqual(
      compactLayout.viewportWidth,
    );
    expect(compactLayout.appWidth).toBeLessThanOrEqual(compactLayout.viewportWidth);
    expect(compactLayout.gridWidth).toBeLessThanOrEqual(compactLayout.gridClientWidth);
    const compactScreenshot = testInfo.outputPath("achievements-compact-linux.png");
    await page.screenshot({ path: compactScreenshot });
    await testInfo.attach("achievements-compact-linux", {
      path: compactScreenshot,
      contentType: "image/png",
    });
    const gameView = page.locator(".game-view");

    for (const [label, position] of [
      ["top", 0],
      ["middle", 0.5],
      ["bottom", 1],
    ] as const) {
      await gameView.evaluate((element, offset) => {
        element.scrollTop = Math.round(
          (element.scrollHeight - element.clientHeight) * offset,
        );
      }, position);
      if (label === "bottom") {
        await expect(achievementGrid.locator("article").last()).toBeVisible();
      }

      const screenshot = testInfo.outputPath(`achievements-${label}-linux.png`);
      await page.screenshot({ path: screenshot });
      await testInfo.attach(`achievements-${label}-linux`, {
        path: screenshot,
        contentType: "image/png",
      });
    }

    const measurementsFile = testInfo.outputPath("theme-contrast-measurements.json");
    await fs.writeFile(measurementsFile, JSON.stringify(measurements, null, 2));
    await testInfo.attach("theme-contrast-measurements", {
      path: measurementsFile,
      contentType: "application/json",
    });
    console.info("ACHIEVEMENT_THEME_CONTRAST", JSON.stringify(measurements));
  });
});
