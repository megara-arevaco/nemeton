import { test, expect } from "./fixtures";
import type {} from "../apps/desktop/src/renderer/env";
import fs from "node:fs/promises";
import path from "node:path";

const portableDate = "2025-04-05T12:00:00.000Z";

function portableGame(
  id: string,
  source: "local" | "steam",
  sourceId: string,
  title: string,
  steamAppId: string | null = source === "steam" ? sourceId : null,
) {
  return {
    id,
    source,
    sourceId,
    steamAppId,
    achievementStateId: null,
    ludusaviGameName: null,
    title,
    coverUrl: null,
    heroUrl: null,
    playtimeMinutes: 30,
    playtimeSecondsRemainder: 0,
    platformPlaytimeMinutes: source === "steam" ? 30 : null,
    trackedPlaytimeSeconds: 0,
    hiddenFromLibrary: false,
    favorite: false,
    backlogStatus: null,
    lastPlayedAt: null,
    importedAt: portableDate,
    updatedAt: portableDate,
  };
}

function portableBackup(
  games: ReturnType<typeof portableGame>[],
  sessions: Array<{
    id: string;
    gameId: string;
    startedAt: string;
    endedAt: string;
    durationSeconds: number;
    origin: "launcher" | "steam-sync";
  }>,
  excludedGameKeys: string[],
) {
  return {
    format: "nemeton-portable-data",
    version: 1,
    exportedAt: portableDate,
    preferences: { language: "es", accentTheme: "forest" },
    library: { version: 1, games, sessions, excludedGameKeys },
    achievementHistory: [],
    savegamePolicies: {},
  };
}

test("first use can add a local game without a Steam key", async ({ desktop }) => {
  const { page } = desktop;
  const settings = await page.evaluate(() => window.launcher.getSteamSettings());
  expect(settings.hasApiKey).toBe(false);
  await expect(
    page.getByRole("button", { name: "Importar juegos instalados", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Añadir juego", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Añadir juego", exact: true })
    .click();
  await page.getByLabel("Nombre del juego").fill("No-key local game");
  await page.getByRole("button", { name: "Añadir a la biblioteca" }).click();
  await expect(
    page.getByRole("heading", { name: "No-key local game", exact: true }),
  ).toBeVisible();
});

test("creates, edits and persists a local game across restart", async ({ desktop }) => {
  let page = desktop.page;
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Añadir juego", exact: true })
    .click();
  const add = page.getByRole("dialog", { name: "Añadir un juego" });
  await expect(
    add.getByRole("button", { name: "Añadir a la biblioteca" }),
  ).toBeDisabled();
  await add.getByLabel("Nombre del juego").fill("E2E Adventure");
  await add.getByRole("button", { name: "Añadir a la biblioteca" }).click();
  await expect(add).not.toBeVisible();
  await page
    .getByRole("group", { name: /^Lista de juegos/ })
    .getByRole("button", { name: /^E2E Adventure,/ })
    .click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Editar ficha" });
  await edit.getByLabel("Nombre", { exact: true }).fill("E2E Renamed");
  await edit.getByLabel("Horas acumuladas").fill("-1");
  await edit.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(edit.getByRole("alert")).toHaveText("Introduce unas horas válidas");
  await edit.getByLabel("Horas acumuladas").fill("2.5");
  await edit.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(edit).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "E2E Renamed", exact: true }),
  ).toBeVisible();
  page = await desktop.restart();
  const games = await page.evaluate(
    async () => (await window.launcher.listGames()).games,
  );
  expect(games).toHaveLength(1);
  expect(games[0]).toMatchObject({ title: "E2E Renamed", playtimeMinutes: 150 });
  await expect(
    page
      .getByRole("group", { name: /^Lista de juegos/ })
      .getByRole("button", { name: /^E2E Renamed,/ }),
  ).toBeVisible();
  const saved = JSON.parse(
    await fs.readFile(path.join(desktop.directory, "data/library.json"), "utf8"),
  );
  expect(saved.games[0].title).toBe("E2E Renamed");
});

test("stores favorites and backlog status and filters them together", async ({
  desktop,
}) => {
  const { page } = desktop;
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Añadir juego", exact: true })
    .click();
  await page.getByLabel("Nombre del juego").fill("E2E Backlog");
  await page.getByRole("button", { name: "Añadir a la biblioteca" }).click();
  await page.getByRole("button", { name: "Añadir a favoritos", exact: true }).click();
  await page.getByLabel("Estado del juego").selectOption("playing");
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Favoritos", exact: true }).click();
  await page.getByLabel("Filtrar por estado").selectOption("playing");
  const collection = page.getByRole("group", { name: "Juegos de la biblioteca" });
  await expect(collection.getByRole("button", { name: /^E2E Backlog,/ })).toBeVisible();
  await page.getByLabel("Filtrar por estado").selectOption("finished");
  await expect(
    page.getByText("No hay juegos con estos filtros", { exact: true }),
  ).toBeVisible();
  const snapshot = await page.evaluate(() => window.launcher.listGames());
  expect(snapshot.games[0]).toMatchObject({ favorite: true, backlogStatus: "playing" });
});

test("requires matching confirmation and persists permanent deletion", async ({
  desktop,
}) => {
  let page = desktop.page;
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Añadir juego", exact: true })
    .click();
  await page.getByLabel("Nombre del juego").fill("E2E Delete");
  await page.getByRole("button", { name: "Añadir a la biblioteca" }).click();
  await page
    .getByRole("group", { name: /^Lista de juegos/ })
    .getByRole("button", { name: /^E2E Delete,/ })
    .click();
  await page.getByRole("button", { name: "Más acciones", exact: true }).click();
  await page
    .getByRole("button", { name: "Eliminar para siempre", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Eliminar para siempre" });
  await modal.getByLabel("Nombre del juego").fill("wrong name");
  await expect(
    modal.getByRole("button", { name: "Eliminar definitivamente" }),
  ).toBeDisabled();
  await modal.getByLabel("Nombre del juego").fill("E2E Delete");
  await modal.getByRole("button", { name: "Eliminar definitivamente" }).click();
  await expect(modal).not.toBeVisible();
  page = await desktop.restart();
  const snapshot = await page.evaluate(() => window.launcher.listGames());
  expect(snapshot.games).toEqual([]);
  expect(snapshot.excludedGameKeys).toHaveLength(1);
  await expect(page.getByRole("button", { name: /^E2E Delete,/ })).toHaveCount(0);
});

test("exports data without secrets or machine paths and imports with safety copies", async ({
  desktop,
}) => {
  const { app, page, directory } = desktop;
  const executable = path.join(directory, "fictional-game.exe");
  const exportPath = path.join(directory, "nemeton-export.json");
  await fs.writeFile(executable, "fictional executable placeholder");
  await page.evaluate(
    (executablePath) =>
      window.launcher.addLocalGame({ title: "Portable Fixture", executablePath }),
    executable,
  );
  await page.evaluate(async () => {
    const snapshot = await window.launcher.listGames();
    await window.launcher.getSavegames(snapshot.games[0]!.id);
  });
  await fs.writeFile(
    path.join(directory, "data", "settings.json"),
    JSON.stringify({
      steamId: "76561198000000000",
      encryptedSteamApiKey: "dpapi:DO_NOT_EXPORT_E2E_SECRET",
      syncFolderPath: "private-sync-path",
    }),
  );
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, exportPath);
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page.getByRole("button", { name: "Exportar datos", exact: true }).click();
  await expect(page.getByText(/Exportado 1 juego\./, { exact: false })).toBeVisible();
  const exported = JSON.parse(await fs.readFile(exportPath, "utf8"));
  expect(exported.format).toBe("nemeton-portable-data");
  expect(exported.library.games[0]).not.toHaveProperty("installPath");
  expect(exported.library.games[0]).not.toHaveProperty("coverPath");
  expect(exported.achievementHistory).toEqual([]);
  expect(exported.preferences).toMatchObject({ language: "es", accentTheme: "forest" });
  expect(JSON.stringify(exported)).not.toContain("DO_NOT_EXPORT_E2E_SECRET");
  expect(JSON.stringify(exported)).not.toContain("private-sync-path");
  expect(JSON.stringify(exported)).not.toContain(executable);

  await app.evaluate(({ dialog }, source) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, exportPath);
  await page.getByRole("button", { name: "Importar datos", exact: true }).click();
  await expect(
    page.getByText(/Datos combinados para 1 juego\./, { exact: false }),
  ).toBeVisible();
  const game = await page.evaluate(
    async () => (await window.launcher.listGames()).games[0],
  );
  expect(game).toMatchObject({ title: "Portable Fixture", installPath: executable });
  const importBackups = (await fs.readdir(path.join(directory, "data"))).filter(
    (name) => name.endsWith(".bak"),
  );
  expect(importBackups).toHaveLength(2);

  await page.evaluate(() =>
    window.launcher.addLocalGame({ title: "Post-import Fixture", executablePath: "" }),
  );
  expect((await page.evaluate(() => window.launcher.listGames())).games).toHaveLength(
    2,
  );
  const libraryBackup = page
    .locator(".portable-recovery")
    .first()
    .getByRole("listitem")
    .filter({ hasText: "Biblioteca y sesiones" });
  await expect(libraryBackup).toHaveCount(1);
  await libraryBackup
    .getByRole("button", { name: "Restaurar copia…", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Copia restaurada");
  const restored = await page.evaluate(() => window.launcher.listGames());
  expect(restored.games.map((entry) => entry.title)).toEqual(["Portable Fixture"]);
  const allBackups = (await fs.readdir(path.join(directory, "data"))).filter((name) =>
    name.endsWith(".bak"),
  );
  expect(allBackups).toHaveLength(3);
});

test.describe("portable import safety", () => {
  test.use({
    gameCount: 1,
    sessionData: {
      sessions: [
        {
          id: "local-session",
          gameId: "local-0",
          startedAt: "2025-04-04T12:00:00.000Z",
          endedAt: "2025-04-04T12:15:00.000Z",
          durationSeconds: 900,
          origin: "launcher",
        },
      ],
      excludedGameKeys: ["local:fixture-own-excluded"],
    },
  });

  test("merges exclusions and sessions non-destructively, idempotently, and exports without secrets", async ({
    desktop,
  }) => {
    const { app, page, directory } = desktop;
    const importPath = path.join(directory, "conflicting-backup.json");
    const exportPath = path.join(directory, "merged-backup.json");
    const remoteSession = (id: string, gameId: string) => ({
      id,
      gameId,
      startedAt: portableDate,
      endedAt: "2025-04-05T12:05:00.000Z",
      durationSeconds: 300,
      origin: "launcher" as const,
    });
    const backup = portableBackup(
      [
        portableGame("remote-existing", "local", "fixture-0", "Remote replacement"),
        portableGame(
          "remote-own-excluded",
          "local",
          "fixture-own-excluded",
          "Own exclusion",
        ),
        portableGame(
          "remote-excluded",
          "local",
          "remote-only-excluded",
          "Remote exclusion",
        ),
        portableGame("remote-steam", "steam", "98765", "Imported Steam game"),
      ],
      [
        remoteSession("session-existing-remote", "remote-existing"),
        remoteSession("session-own-excluded", "remote-own-excluded"),
        remoteSession("session-remote-excluded", "remote-excluded"),
        remoteSession("session-steam", "remote-steam"),
      ],
      ["local:fixture-0", "local:remote-only-excluded"],
    );
    await fs.writeFile(importPath, JSON.stringify(backup));
    const existingAchievement = {
      gameSourceId: "fixture-0",
      achievementId: "local-achievement",
      name: "Local achievement",
      detectedAt: "2025-04-04T12:00:00.000Z",
      unlockedAt: "2025-04-04T12:00:00.000Z",
      source: "fixture",
    };
    await fs.writeFile(
      path.join(directory, "data", "achievements-history.json"),
      JSON.stringify([existingAchievement]),
    );
    await fs.writeFile(
      path.join(directory, "data", "settings.json"),
      JSON.stringify({
        steamId: "76561198000000000",
        encryptedSteamApiKey: "dpapi:PORTABLE_IMPORT_SECRET_FIXTURE",
        syncFolderPath: path.join(directory, "private-sync-folder"),
      }),
    );
    await app.evaluate(({ dialog }, source) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    }, importPath);

    const original = await page.evaluate(() => window.launcher.listGames());
    expect(original.games).toHaveLength(1);
    await page.getByRole("button", { name: "Ajustes", exact: true }).click();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.getByRole("button", { name: "Importar datos", exact: true }).click();
      await expect(page.getByRole("status")).toContainText(
        "Datos combinados para 4 juegos.",
      );
      const merged = await page.evaluate(() => window.launcher.listGames());
      expect(merged.games).toHaveLength(2);
      expect(merged.sessions).toHaveLength(2);
      expect(merged.excludedGameKeys).toEqual(
        expect.arrayContaining([
          "local:fixture-own-excluded",
          "local:fixture-0",
          "local:remote-only-excluded",
        ]),
      );

      const existing = merged.games.find((game) => game.id === "local-0");
      expect(existing).toMatchObject({
        sourceId: "fixture-0",
        title: "Fixture 0000",
        installPath: "",
      });
      expect(
        merged.games.find((game) => game.sourceId === "fixture-own-excluded"),
      ).toBeUndefined();
      expect(
        merged.games.find((game) => game.sourceId === "remote-only-excluded"),
      ).toBeUndefined();
      const importedSteam = merged.games.find((game) => game.sourceId === "98765");
      expect(importedSteam).toMatchObject({
        source: "steam",
        launchUri: "steam://rungameid/98765",
      });
      expect(merged.sessions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "local-session", gameId: "local-0" }),
          expect.objectContaining({ id: "session-steam", gameId: importedSteam!.id }),
        ]),
      );
      expect(
        merged.sessions.every((session) =>
          merged.games.some((game) => game.id === session.gameId),
        ),
      ).toBe(true);
      expect(
        JSON.parse(
          await fs.readFile(
            path.join(directory, "data", "achievements-history.json"),
            "utf8",
          ),
        ),
      ).toEqual([existingAchievement]);
    }

    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
    }, exportPath);
    await page.getByRole("button", { name: "Exportar datos", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Exportados 2 juegos.");
    const exported = JSON.parse(await fs.readFile(exportPath, "utf8"));
    const serialized = JSON.stringify(exported);
    expect(exported.library.sessions).toHaveLength(2);
    expect(exported.achievementHistory).toEqual([existingAchievement]);
    expect(
      exported.library.sessions.every((session: { gameId: string }) =>
        exported.library.games.some(
          (game: { id: string }) => game.id === session.gameId,
        ),
      ),
    ).toBe(true);
    expect(exported.library.excludedGameKeys).toEqual(
      expect.arrayContaining([
        "local:fixture-own-excluded",
        "local:fixture-0",
        "local:remote-only-excluded",
      ]),
    );
    expect(serialized).not.toContain("PORTABLE_IMPORT_SECRET_FIXTURE");
    expect(serialized).not.toContain("private-sync-folder");
    expect(serialized).not.toContain(directory);
  });
});

test("rejects malformed or inconsistent Steam AppIDs without changing local data", async ({
  desktop,
}) => {
  const { app, page, directory } = desktop;
  const importPath = path.join(directory, "invalid-backup.json");
  const dataDirectory = path.join(directory, "data");
  const originalLibrary = await fs.readFile(
    path.join(dataDirectory, "library.json"),
    "utf8",
  );
  await fs.writeFile(
    path.join(dataDirectory, "settings.json"),
    JSON.stringify({
      steamId: "fixture-steam-account",
      encryptedSteamApiKey: "fixture-secret",
    }),
  );
  const originalSettings = await fs.readFile(
    path.join(dataDirectory, "settings.json"),
    "utf8",
  );
  const invalidBackups = [
    portableBackup(
      [portableGame("bad-id", "steam", "123/steam://rungameid/1", "Bad AppID")],
      [],
      [],
    ),
    portableBackup(
      [portableGame("mismatched-id", "steam", "12345", "Mismatched AppID", "54321")],
      [],
      [],
    ),
  ];
  await app.evaluate(({ dialog }, source) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, importPath);
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();

  for (const invalid of invalidBackups) {
    await fs.writeFile(importPath, JSON.stringify(invalid));
    await page.getByRole("button", { name: "Importar datos", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(/AppID|sourceId|steamAppId/i);
    expect(await fs.readFile(path.join(dataDirectory, "library.json"), "utf8")).toBe(
      originalLibrary,
    );
    expect(await fs.readFile(path.join(dataDirectory, "settings.json"), "utf8")).toBe(
      originalSettings,
    );
    expect(
      (await fs.readdir(dataDirectory)).filter((name) => name.endsWith(".bak")),
    ).toEqual([]);
  }

  const unchanged = await page.evaluate(() => window.launcher.listGames());
  expect(unchanged.games).toEqual([]);
  expect(unchanged.sessions).toEqual([]);
});

test.describe("large library", () => {
  test.use({ gameCount: 1000 });
  test("virtualizes both collections and supports keyboard navigation and filtering", async ({
    desktop,
  }) => {
    const page = desktop.page;
    const grid = page.getByRole("group", { name: /^Juegos de la biblioteca/ });
    const sidebar = page.getByRole("group", { name: /^Lista de juegos/ });
    await expect(grid.getByRole("button").first()).toBeVisible();
    expect(await grid.getByRole("button").count()).toBeLessThan(100);
    expect(await sidebar.getByRole("button").count()).toBeLessThan(100);
    for (const collection of [grid, sidebar]) {
      await collection.getByRole("button").first().focus();
      await page.keyboard.press("End");
      await expect(
        collection.getByRole("button", { name: /^Fixture 0999,/ }),
      ).toBeFocused();
      await page.keyboard.press("Home");
      await expect(
        collection.getByRole("button", { name: /^Fixture 0000,/ }),
      ).toBeFocused();
    }
    await page.getByPlaceholder("Buscar en tu biblioteca").fill("Fixture 0999");
    await expect(grid.getByRole("button")).toHaveCount(1);
    await page.getByPlaceholder("Buscar en tu biblioteca").fill("no match");
    await expect(
      page.getByText("No hay juegos con estos filtros", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Limpiar filtros", exact: true }).click();
    await page.getByPlaceholder("Buscar en tu biblioteca").fill("Fixture 0999");
    await grid.getByRole("button", { name: /^Fixture 0999,/ }).click();
    await expect(
      page.getByRole("heading", { name: "Fixture 0999", exact: true }),
    ).toBeVisible();
    await page.getByPlaceholder("Buscar en tu biblioteca").fill("");
    await page.getByRole("button", { name: "Estadísticas", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Fixture 0999", exact: true }),
    ).not.toBeVisible();
    await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
    await expect(grid.getByRole("button").first()).toBeVisible();
  });
});
