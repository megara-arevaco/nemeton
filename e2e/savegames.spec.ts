import { test, expect } from "./fixtures";
import type {} from "../apps/desktop/src/renderer/env";
import fs from "node:fs/promises";
import path from "node:path";

test("backs up, verifies and restores saves while preserving the previous state", async ({
  desktop,
}) => {
  const { app, page, directory } = desktop;
  const saves = path.join(directory, "saves");
  const sync = path.join(directory, "sync");
  await fs.mkdir(saves);
  await fs.mkdir(sync);
  const saveFile = path.join(saves, "slot.sav");
  await fs.writeFile(saveFile, "original progress");
  // Replace only native OS dialogs; renderer, preload, IPC and filesystem remain real.
  await app.evaluate(
    ({ dialog }, folders) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folders.sync],
      });
    },
    { sync },
  );
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page.getByRole("button", { name: "Elegir carpeta", exact: true }).click();
  await expect(page.getByText(sync, { exact: true })).toBeVisible();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, saves);
  await page.getByRole("button", { name: "Añadir juego", exact: true }).click();
  await page.getByLabel("Nombre del juego").fill("E2E Saves");
  await page.getByRole("button", { name: "Añadir a la biblioteca" }).click();
  await page
    .getByRole("group", { name: /^Lista de juegos/ })
    .getByRole("button", { name: /^E2E Saves,/ })
    .click();
  await page.getByRole("button", { name: "Indicar carpeta", exact: true }).click();
  await page.getByRole("button", { name: "Sincronizar ahora", exact: true }).click();
  await expect(
    page.getByText("Partidas sincronizadas", { exact: true }).first(),
  ).toBeVisible();
  const gameId = await page.evaluate(
    async () =>
      (await window.launcher.listGames()).games.find(
        (game) => game.title === "E2E Saves",
      )!.id,
  );
  const versions = await page.evaluate(
    async (id) => (await window.launcher.getSavegames(id)).versions,
    gameId,
  );
  expect(versions).toHaveLength(1);
  expect(versions[0].fileCount).toBe(1);
  expect(
    await page.evaluate((id) => window.launcher.verifySavegames(id), gameId),
  ).toMatchObject({ syncState: "synced" });
  await fs.writeFile(saveFile, "new progress");
  expect(
    await page.evaluate((id) => window.launcher.verifySavegames(id), gameId),
  ).not.toMatchObject({ syncState: "synced" });
  // A canceled native confirmation must leave the save untouched.
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  });
  expect(
    await page.evaluate(
      ({ gameId, versionId }) => window.launcher.restoreSavegames(gameId, versionId),
      { gameId, versionId: versions[0].id },
    ),
  ).toBeNull();
  expect(await fs.readFile(saveFile, "utf8")).toBe("new progress");
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
  expect(
    await page.evaluate(
      ({ gameId, versionId }) => window.launcher.restoreSavegames(gameId, versionId),
      { gameId, versionId: versions[0].id },
    ),
  ).toMatchObject({ restoredFiles: 1 });
  expect(await fs.readFile(saveFile, "utf8")).toBe("original progress");
  const after = await page.evaluate(
    async (id) => (await window.launcher.getSavegames(id)).versions,
    gameId,
  );
  expect(after).toHaveLength(2);
  const safetyCopy = after.find((version) => version.id !== versions[0].id)!;
  await page.evaluate(
    ({ gameId, versionId }) => window.launcher.restoreSavegames(gameId, versionId),
    { gameId, versionId: safetyCopy.id },
  );
  expect(await fs.readFile(saveFile, "utf8")).toBe("new progress");
});
