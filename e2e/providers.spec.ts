import fs from "node:fs/promises";
import path from "node:path";
import { test, expect } from "./fixtures";
import { discoverStoreInstallations } from "../apps/desktop/src/main/provider-discovery";

test("Epic and GOG adapters import, group 33 hours, install, persist and export diagnostics without secrets", async ({
  desktop,
}, testInfo) => {
  test.skip(
    process.platform === "win32",
    "The fixture helper is a POSIX executable; native Windows helper validation is separate.",
  );
  const { app, page, directory } = desktop;
  const rendererErrors: string[] = [];
  page.on("pageerror", (error) => rendererErrors.push(error.message));
  const helper = path.join(directory, "helper with spaces");
  await fs.writeFile(
    helper,
    `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
const args = process.argv.slice(2); const gog = args[0] === '--auth-config-path';
const credential = gog ? args[1] : path.join(process.env.LEGENDARY_CONFIG_PATH, 'user.json');
const a = args.slice(gog ? 2 : 1); const command = a[0];
const installedFile = path.join(process.env.LEGENDARY_CONFIG_PATH, 'fixture-installed.json');
if (command === 'auth') {
  const auth = { access_token: 'sentinel-private-token', refresh_token: 'sentinel-private-refresh', user_id: 'fixture_gog_user', account_id: 'fixture_epic_user', displayName: 'Fixture account' };
  if (a.includes('--code')) fs.writeFileSync(credential, JSON.stringify(gog ? { client: auth } : auth));
  console.log(JSON.stringify(auth));
} else if (command === 'list-games') {
  console.log(JSON.stringify([{app_name:'epic_fixture', app_title:'Unified Fixture', metadata:{}}]));
} else if (command === 'list-installed') {
  console.log(fs.existsSync(installedFile) ? fs.readFileSync(installedFile, 'utf8') : '[]');
} else if (command === 'install') {
  const base = a[a.indexOf('--base-path') + 1]; const location = path.join(base, 'epic_fixture');
  fs.mkdirSync(location, {recursive: true}); fs.writeFileSync(path.join(location, 'game.bin'), 'fixture');
  fs.writeFileSync(installedFile, JSON.stringify([{app_name:'epic_fixture', install_path:location}]));
  console.log('100%');
} else if (command === 'verify') { console.log('100%'); }
else { process.exitCode = 1; }
`,
    { mode: 0o700 },
  );
  await app.evaluate(({ dialog }, helper) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [helper] });
    globalThis.fetch = async (input) => {
      const url = String(input);
      const json = (value: unknown) => new Response(JSON.stringify(value));

      if (url.includes("GetOwnedGames")) {
        return json({
          response: {
            game_count: 1,
            games: [{ appid: 10, name: "Unified Fixture", playtime_forever: 1200 }],
          },
        });
      }
      if (url.includes("/playtime/account/")) {
        return json([{ artifactId: "epic_fixture", totalTime: 28800 }]);
      }
      if (url.includes("/userData.json")) {
        return json({ username: "Fixture GOG account" });
      }
      if (url.includes("/getFilteredProducts")) {
        return json({
          totalPages: 1,
          products: [{ id: 10, title: "Unified Fixture" }],
        });
      }
      if (url.includes("/sessions")) {
        return json({ time_sum: 300 });
      }
      throw new Error("Fixture blocks unsupported requests");
    };
  }, helper);
  await page.evaluate(async () => {
    await window.launcher.connectSteam("a".repeat(32), "76561198000000000");
    for (const provider of ["epic", "gog"] as const) {
      await window.launcher.chooseProviderHelper(provider);
      await window.launcher.connectProvider(provider, "fixture_auth_code");
    }

    const library = await window.launcher.listGames();
    await window.launcher.linkGameCopies(
      library.games.map((game) => game.id),
      library.games[0].id,
    );
  });
  const grid = page.getByRole("group", { name: /^Juegos de la biblioteca/ });
  await expect(grid.getByRole("button")).toHaveCount(1);
  await grid.getByRole("button", { name: /Unified Fixture/ }).click();
  await expect(page.locator(".copy-list .copy")).toHaveCount(3);
  await expect
    .poll(async () =>
      (await page.evaluate(() => window.launcher.listGames())).games.reduce(
        (sum, game) => sum + game.playtimeMinutes,
        0,
      ),
    )
    .toBe(33 * 60);
  await expect(page.locator(".game-copies").first()).toContainText("33");
  const epicCopy = page.locator(".copy-list .copy").filter({ hasText: "Epic Games" });
  await epicCopy.getByRole("button", { name: "Usar esta copia", exact: true }).click();
  const installFolder = path.join(directory, "managed installations");
  await fs.mkdir(installFolder);
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, installFolder);
  await page.getByRole("button", { name: "Instalar", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.launcher.listGames())).games.find(
          (game) => game.source === "epic",
        )?.installed,
    )
    .toBe(true);
  await expect(page.getByRole("button", { name: "Jugar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Verificar archivos", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.launcher.getProviderStates())).find(
          (state) => state.provider === "epic",
        )?.operation,
    )
    .toBeNull();
  await expect
    .poll(async () =>
      (await page.evaluate(() => window.launcher.listGames())).games.reduce(
        (sum, game) => sum + game.playtimeMinutes,
        0,
      ),
    )
    .toBe(33 * 60);
  await page.evaluate(async () => {
    const game = (await window.launcher.listGames()).games.find(
      (item) => item.source === "epic",
    )!;
    await window.launcher.organizeGame(game.id, {
      collections: ["Weekend", "RPG"],
      tags: ["Story", "Controller"],
    });
  });
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.launcher.listGames())).games.find(
          (game) => game.source === "epic",
        )?.collections,
    )
    .toEqual(["Weekend", "RPG"]);
  await page.screenshot({ path: testInfo.outputPath("unified-game.png") });
  const libraryBeforeBackup = await page.evaluate(() => window.launcher.listGames());
  const syncFolder = path.join(directory, "backup destination");
  await fs.mkdir(syncFolder);
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, syncFolder);
  await page.evaluate(() => window.launcher.selectSyncFolder());
  for (const source of ["steam", "gog"] as const) {
    const game = libraryBeforeBackup.games.find((game) => game.source === source)!;
    const folder = path.join(directory, `${source} saves`);
    await fs.mkdir(folder);
    await fs.writeFile(path.join(folder, "save.dat"), source);
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, folder);
    await page.evaluate(async (id) => {
      await window.launcher.addSavegameFolder(id);
      await window.launcher.backupSavegames(id);
    }, game.id);
    const verification = await page.evaluate(
      (id) => window.launcher.verifySavegames(id),
      game.id,
    );
    expect(verification.syncState).toBe("synced");
    const state = await page.evaluate(
      (id) => window.launcher.getSavegames(id),
      game.id,
    );
    expect(state.lastVerification?.versionId).toBe(verification.versionId);
  }
  expect(await fs.readdir(path.join(syncFolder, "launcher-next-saves"))).toEqual(
    expect.arrayContaining(["steam-10", "gog-10"]),
  );
  expect(rendererErrors).toEqual([]);
  const report = path.join(directory, "diagnostics.json");
  await app.evaluate(({ dialog }, report) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: report });
  }, report);
  expect(await page.evaluate(() => window.launcher.exportDiagnostics())).toBe(true);
  const diagnostics = await fs.readFile(report, "utf8");

  for (const forbidden of [
    "sentinel-private",
    "Unified Fixture",
    "fixture_epic_user",
    "fixture_gog_user",
    directory,
  ]) {
    expect(diagnostics).not.toContain(forbidden);
  }

  const config = await fs.readFile(
    path.join(directory, "data/providers/providers.json"),
    "utf8",
  );
  expect(config).not.toContain("sentinel-private");
  for (const [provider, filename] of [
    ["epic", "user.json"],
    ["gog", "auth.json"],
  ]) {
    expect(
      await fs
        .stat(path.join(directory, "data/providers", provider, filename))
        .catch(() => null),
    ).toBeNull();
  }
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByRole("combobox", { name: "Tienda", exact: true }).click();
  await page.getByRole("option", { name: "GOG", exact: true }).click();
  const restarted = await desktop.restart();
  await expect(
    restarted.getByRole("combobox", { name: "Tienda", exact: true }),
  ).toHaveText("GOG");
  await expect(
    restarted
      .getByRole("group", { name: /^Juegos de la biblioteca/ })
      .getByRole("button"),
  ).toHaveCount(1);
  expect(
    (await restarted.evaluate(() => window.launcher.listGames())).games.reduce(
      (sum, game) => sum + game.playtimeMinutes,
      0,
    ),
  ).toBe(33 * 60);
});

test("store discovery reads installed manifests and ignores incomplete or malformed entries", async () => {
  const os = await import("node:os");
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "nemeton-store-discovery-"),
  );
  const previousEpic = process.env.NEMETON_EPIC_MANIFESTS;
  const previousGog = process.env.NEMETON_GOG_ROOT;

  try {
    const manifests = path.join(directory, "manifests");
    const gogRoot = path.join(directory, "gog");
    const epicInstall = path.join(directory, "epic game");
    const gogInstall = path.join(gogRoot, "game");
    await Promise.all([
      fs.mkdir(manifests),
      fs.mkdir(epicInstall),
      fs.mkdir(gogInstall, { recursive: true }),
    ]);
    await fs.writeFile(
      path.join(manifests, "game.item"),
      JSON.stringify({ AppName: "fixture", InstallLocation: epicInstall }),
    );
    await fs.writeFile(
      path.join(manifests, "incomplete.item"),
      JSON.stringify({
        AppName: "incomplete",
        InstallLocation: epicInstall,
        bIsIncompleteInstall: true,
      }),
    );
    await fs.writeFile(path.join(manifests, "invalid.item"), "not JSON");
    await fs.writeFile(
      path.join(gogInstall, "goggame-10.info"),
      JSON.stringify({ gameId: "10" }),
    );
    process.env.NEMETON_EPIC_MANIFESTS = manifests;
    process.env.NEMETON_GOG_ROOT = gogRoot;
    expect([...(await discoverStoreInstallations("epic")).entries()]).toEqual([
      ["fixture", epicInstall],
    ]);
    expect([...(await discoverStoreInstallations("gog")).entries()]).toEqual([
      ["10", gogInstall],
    ]);
  } finally {
    if (previousEpic === undefined) {
      delete process.env.NEMETON_EPIC_MANIFESTS;
    } else {
      process.env.NEMETON_EPIC_MANIFESTS = previousEpic;
    }
    if (previousGog === undefined) {
      delete process.env.NEMETON_GOG_ROOT;
    } else {
      process.env.NEMETON_GOG_ROOT = previousGog;
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});
