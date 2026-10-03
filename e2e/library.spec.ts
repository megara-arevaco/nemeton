import { test, expect } from "./fixtures";
import type {} from "../apps/desktop/src/renderer/env";
import fs from "node:fs/promises";
import path from "node:path";

test("creates, edits and persists a local game across restart", async ({ desktop }) => {
  let page = desktop.page;
  await page.getByRole("button", { name: "Añadir juego", exact: true }).click();
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

test("requires matching confirmation and persists permanent deletion", async ({
  desktop,
}) => {
  let page = desktop.page;
  await page.getByRole("button", { name: "Añadir juego", exact: true }).click();
  await page.getByLabel("Nombre del juego").fill("E2E Delete");
  await page.getByRole("button", { name: "Añadir a la biblioteca" }).click();
  await page
    .getByRole("group", { name: /^Lista de juegos/ })
    .getByRole("button", { name: /^E2E Delete,/ })
    .click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
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
    await grid.getByRole("button").click();
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
