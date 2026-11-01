import { test, expect } from "./fixtures";
import fs from "node:fs/promises";
import path from "node:path";

test.use({ gameCount: 3 });

test("sidebar only shows installed games and ignores obsolete saved filters", async ({
  desktop,
}) => {
  const executable = path.join(desktop.directory, "installed-game.exe");
  await fs.writeFile(executable, "fixture");
  await desktop.page.evaluate(async (executablePath) => {
    await window.launcher.addLocalGame({ title: "Installed game", executablePath });
    localStorage.setItem("nemeton.sidebar.all", "true");
    localStorage.setItem("nemeton.library.favorites", "true");
    localStorage.setItem("nemeton.library.backlog", "finished");
  }, executable);
  let page = await desktop.restart();
  let sidebar = page.getByRole("group", { name: /^Lista de juegos/ });
  await expect(sidebar.getByRole("button")).toHaveCount(1);
  await expect(sidebar.getByText("Installed game", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("group", { name: /^Juegos de la biblioteca/ }).getByRole("button"),
  ).toHaveCount(4);
  await expect(page.locator(".sidebar-library-tabs")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Tienda", exact: true }).click();
  await page.getByRole("option", { name: "Steam", exact: true }).click();
  await expect(sidebar.getByRole("button")).toHaveCount(1);
  page = await desktop.restart();
  sidebar = page.getByRole("group", { name: /^Lista de juegos/ });
  await expect(sidebar.getByRole("button")).toHaveCount(1);
});

test("store menu supports keyboard, dismissal and persisted selection", async ({
  desktop,
}) => {
  let page = desktop.page;
  const store = page.getByRole("combobox", { name: "Tienda", exact: true });
  await store.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("listbox", { name: "Tienda", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(store).toHaveText("Local");
  await store.click();
  await page.keyboard.press("Escape");
  await expect(store).toBeFocused();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await store.click();
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Colección", exact: true }),
  ).toHaveCount(0);
  page = await desktop.restart();
  await expect(page.getByRole("combobox", { name: "Tienda", exact: true })).toHaveText(
    "Local",
  );
  await expect(
    page.getByRole("group", { name: /^Juegos de la biblioteca/ }).getByRole("button"),
  ).toHaveCount(3);
});

test("unconnected Steam library explains missing games and opens the account form", async ({
  desktop,
}) => {
  const filename = path.join(desktop.directory, "data/library.json");
  const snapshot = JSON.parse(await fs.readFile(filename, "utf8"));
  snapshot.games[0].source = "steam";
  snapshot.games[0].sourceId = "10";
  await fs.writeFile(filename, JSON.stringify(snapshot));
  const page = await desktop.restart();
  const notice = page.getByRole("region", {
    name: "Tu biblioteca de Steam aún no está conectada",
  });
  await expect(notice).toBeVisible();
  await notice
    .getByRole("button", { name: "Conectar cuenta de Steam", exact: true })
    .click();
  await expect(page.getByLabel("Steam Web API key", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Steam Web API key", { exact: true })).toBeInViewport();
});
