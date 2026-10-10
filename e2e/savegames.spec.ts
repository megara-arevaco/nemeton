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
  await page.getByRole("button", { name: "Añadir carpeta local", exact: true }).click();
  await page
    .getByRole("button", { name: "Crear / comprobar copia", exact: true })
    .click();
  await expect(
    page.getByText("Copia guardada en la carpeta configurada", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Integridad sin comprobar", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Verificar", exact: true }).click();
  await expect(page.getByText("Integridad verificada", { exact: true })).toBeVisible();
  const game = await page.evaluate(
    async () =>
      (await window.launcher.listGames()).games.find(
        (item) => item.title === "E2E Saves",
      )!,
  );
  const gameId = game.id;
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

  await fs.writeFile(path.join(saves, "overflow.sav"), Buffer.alloc(1024 * 1024 + 1));
  const backupError = await page.evaluate(async (id) => {
    await window.launcher.setSavegamePolicy(id, { maxSizeMb: 1 });
    try {
      await window.launcher.backupSavegames(id);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, gameId);
  expect(backupError).toContain("La copia supera el tamaño permitido");
  await expect(page.getByRole("alert")).toContainText("Falló la última copia");

  const archivePath = path.join(
    sync,
    "launcher-next-saves",
    game.sourceId,
    "versions",
    `${versions[0]!.id}.zip`,
  );
  await fs.writeFile(archivePath, "fictitious corruption");
  await expect(
    page.evaluate(
      ({ id, versionId }) => window.launcher.verifySavegameVersion(id, versionId),
      {
        id: gameId,
        versionId: versions[0]!.id,
      },
    ),
  ).resolves.toBe("corrupt");
});
