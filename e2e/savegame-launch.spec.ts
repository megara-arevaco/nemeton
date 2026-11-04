import { test, expect } from "./fixtures";
import fs from "node:fs/promises";
import path from "node:path";
import { SavegameManager } from "../apps/desktop/src/main/savegames";

// A real remote archive and real IPC; only native user choices are substituted.
test("launch cancels for a remote save or restores it into a new destination before reaching game startup", async ({
  desktop,
}) => {
  const { page, app, directory } = desktop;
  const source = path.join(directory, "other-device", "saves");
  const destination = path.join(directory, "this-device", "chosen-save-folder");
  const sync = path.join(directory, "shared-drive");
  await fs.mkdir(source, { recursive: true });
  await fs.mkdir(sync);
  await fs.writeFile(path.join(source, "slot.sav"), "remote progress");
  const game = await page.evaluate(async () => {
    await window.launcher.addLocalGame({
      title: "Pre-launch restore",
      executablePath: "",
    });
    return (await window.launcher.listGames()).games.find(
      (entry) => entry.title === "Pre-launch restore",
    )!;
  });
  const remote = new SavegameManager(
    path.join(directory, "remote-device-data", "savegames.json"),
  );
  await remote.addPath("remote-game", source);
  await remote.backup("remote-game", game.sourceId, sync);
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  }, sync);
  await page.evaluate(() => window.launcher.selectSyncFolder());
  await page.evaluate((id) => window.launcher.launchGame(id), game.id);
  expect(await fs.stat(destination).catch(() => null)).toBeNull();
  expect(
    (await page.evaluate((id) => window.launcher.getSavegames(id), game.id)).paths,
  ).toEqual([]);
  // Choosing the local save is explicit and does not restore the cloud copy.
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 2, checkboxChecked: false });
  });
  await expect(
    page.evaluate((id) => window.launcher.launchGame(id), game.id),
  ).rejects.toThrow("todavía no tiene ejecutable");
  expect(await fs.stat(destination).catch(() => null)).toBeNull();
  // Cancel the final review after selecting a destination: still no changes.
  await app.evaluate(({ dialog }, folder) => {
    let messages = 0;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    dialog.showMessageBox = async () => ({
      response: messages++ === 0 ? 1 : 0,
      checkboxChecked: false,
    });
  }, destination);
  await page.evaluate((id) => window.launcher.launchGame(id), game.id);
  expect(await fs.stat(destination).catch(() => null)).toBeNull();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, destination);
  // The intentionally absent executable stops startup after the saves have been restored.
  await expect(
    page.evaluate((id) => window.launcher.launchGame(id), game.id),
  ).rejects.toThrow("todavía no tiene ejecutable");
  expect(await fs.readFile(path.join(destination, "slot.sav"), "utf8")).toBe(
    "remote progress",
  );
  expect(
    (await page.evaluate((id) => window.launcher.getSavegames(id), game.id)).paths,
  ).toEqual([destination]);
});
