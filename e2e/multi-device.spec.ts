import { test, expect, launchIsolatedDesktop } from "./fixtures";
import fs from "node:fs/promises";
import path from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";

async function choosePaths(app: ElectronApplication, paths: string[]) {
  await app.evaluate(({ dialog }, queue) => {
    const remaining = [...queue];
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [remaining.shift()!],
    });
  }, paths);
}

async function createGame(page: Page, title: string) {
  return page.evaluate(async (name) => {
    await window.launcher.addLocalGame({ title: name, executablePath: "" });
    const library = await window.launcher.listGames();
    return library.games.find((game) => game.title === name)!;
  }, title);
}

test("two isolated Electron devices merge without losing saves and resolve a real folder conflict safely", async ({
  desktop,
}, testInfo) => {
  const deviceA = desktop;
  const deviceBRoot = path.join(desktop.directory, "device-b");
  let deviceB = await launchIsolatedDesktop(deviceBRoot);
  let pageB = await deviceB.app.firstWindow();
  const pageA = deviceA.page;
  const sync = path.join(desktop.directory, "shared-sync-fixture");
  const saveA = path.join(desktop.directory, "device-a", "fictional-save");
  const saveB = path.join(deviceBRoot, "fictional-save");
  await fs.mkdir(sync, { recursive: true });
  await fs.mkdir(saveA, { recursive: true });
  await fs.mkdir(saveB, { recursive: true });
  await expect(pageB.getByRole("navigation")).toBeVisible();

  const saveFileA = path.join(saveA, "progress.sav");
  const saveFileB = path.join(saveB, "progress.sav");
  await fs.writeFile(saveFileA, "shared baseline fixture");
  await fs.writeFile(saveFileB, "shared baseline fixture");
  const primaryGame = await createGame(pageA, "Shared fictional game");
  await pageA.evaluate(
    (gameId) => window.launcher.getSavegames(gameId),
    primaryGame.id,
  );
  await choosePaths(deviceA.app, [saveA, sync]);
  await pageA.evaluate(async (gameId) => {
    await window.launcher.addSavegameFolder(gameId);
    await window.launcher.selectSyncFolder();
    await window.launcher.backupSavegames(gameId);
  }, primaryGame.id);
  const baseline = await pageA.evaluate(
    async (gameId) => (await window.launcher.getSavegames(gameId)).versions[0]!,
    primaryGame.id,
  );

  await choosePaths(deviceB.app, [sync, saveB]);
  await pageB.evaluate(() => window.launcher.selectSyncFolder());
  const importedGame = await pageB.evaluate(
    async () =>
      (await window.launcher.listGames()).games.find(
        (game) => game.title === "Shared fictional game",
      )!,
  );
  expect(importedGame.sourceId).toBe(primaryGame.sourceId);
  await pageB.evaluate(
    (gameId) => window.launcher.getSavegames(gameId),
    importedGame.id,
  );
  await pageB.evaluate(async (gameId) => {
    await window.launcher.addSavegameFolder(gameId);
  }, importedGame.id);

  await fs.writeFile(saveFileA, "remote device A progress");
  await pageA.evaluate(
    (gameId) => window.launcher.backupSavegames(gameId),
    primaryGame.id,
  );
  const remoteVersion = await pageA.evaluate(
    async (gameId) => (await window.launcher.getSavegames(gameId)).versions[0]!,
    primaryGame.id,
  );
  expect(remoteVersion.id).not.toBe(baseline.id);
  await fs.writeFile(saveFileB, "local device B progress");
  const conflict = await pageB.evaluate(
    (gameId) => window.launcher.verifySavegames(gameId),
    importedGame.id,
  );
  expect(conflict.syncState).toBe("conflict");
  expect(conflict.conflict?.id).toBe(remoteVersion.id);
  expect(conflict.localSummary?.fileCount).toBe(1);

  await deviceB.app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
  await pageB.evaluate(
    ({ gameId, versionId }) => window.launcher.restoreSavegames(gameId, versionId),
    { gameId: importedGame.id, versionId: remoteVersion.id },
  );
  expect(await fs.readFile(saveFileB, "utf8")).toBe("remote device A progress");
  const afterRemoteRestore = await pageB.evaluate(
    async (gameId) => (await window.launcher.getSavegames(gameId)).versions,
    importedGame.id,
  );
  const safetyVersion = afterRemoteRestore.find(
    (version) => version.id !== baseline.id && version.id !== remoteVersion.id,
  );
  expect(safetyVersion).toBeDefined();
  await expect(
    pageB.evaluate(
      ({ gameId, versionId }) =>
        window.launcher.verifySavegameVersion(gameId, versionId),
      { gameId: importedGame.id, versionId: safetyVersion!.id },
    ),
  ).resolves.toBe("verified");

  // Restoring the local safety version proves the conflicting bytes remain recoverable.
  await pageB.evaluate(
    ({ gameId, versionId }) => window.launcher.restoreSavegames(gameId, versionId),
    { gameId: importedGame.id, versionId: safetyVersion!.id },
  );
  expect(await fs.readFile(saveFileB, "utf8")).toBe("local device B progress");
  const goodHistory = await fs.readFile(
    path.join(sync, "launcher-next-history.json"),
    "utf8",
  );
  const libraryBeforeFailure = await fs.readFile(
    path.join(deviceB.dataDirectory, "library.json"),
    "utf8",
  );
  await fs.writeFile(
    path.join(sync, "launcher-next-history.json"),
    "{ damaged fixture",
  );
  const syncError = await pageB.evaluate(async () => {
    try {
      await window.launcher.syncNow();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  expect(syncError).toContain("formato válido");
  expect(
    await fs.readFile(path.join(deviceB.dataDirectory, "library.json"), "utf8"),
  ).toBe(libraryBeforeFailure);
  await fs.writeFile(path.join(sync, "launcher-next-history.json"), goodHistory);

  // Concurrent writers either serialize on the shared-folder lock or return an explicit retryable error.
  await createGame(pageA, "Device A extra fixture");
  await createGame(pageB, "Device B extra fixture");
  const concurrent = await Promise.all([
    pageA.evaluate(async () => {
      try {
        await window.launcher.syncNow();
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }),
    pageB.evaluate(async () => {
      try {
        await window.launcher.syncNow();
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }),
  ]);
  expect(concurrent.every((error) => error === null || error.includes("ocupada"))).toBe(
    true,
  );
  await pageB.evaluate(() => window.launcher.syncNow());
  await pageA.evaluate(() => window.launcher.syncNow());
  await pageB.evaluate(() => window.launcher.syncNow());
  const merged = JSON.parse(
    await fs.readFile(path.join(sync, "launcher-next-history.json"), "utf8"),
  ) as {
    games: Array<{ title: string }>;
  };
  expect(merged.games.map((game) => game.title)).toEqual(
    expect.arrayContaining([
      "Shared fictional game",
      "Device A extra fixture",
      "Device B extra fixture",
    ]),
  );

  await deviceB.app.close();
  deviceB = await launchIsolatedDesktop(deviceBRoot);
  pageB = await deviceB.app.firstWindow();
  await expect(pageB.getByRole("navigation")).toBeVisible();
  const afterRestart = await pageB.evaluate(
    (gameId) => window.launcher.getSavegames(gameId),
    importedGame.id,
  );
  expect(afterRestart.paths).toEqual([saveB]);
  expect(await fs.readFile(saveFileB, "utf8")).toBe("local device B progress");
  expect(await pageB.evaluate(() => window.launcher.getSyncSettings())).toMatchObject({
    folderPath: sync,
  });

  const screenshot = testInfo.outputPath("two-device-conflict-linux.png");
  await pageB.screenshot({ path: screenshot });
  await testInfo.attach("two-device-conflict-linux", {
    path: screenshot,
    contentType: "image/png",
  });

  await deviceB.app.close();
});
