import { test, expect } from "./fixtures";

test("changes and remembers the interface language", async ({ desktop }) => {
  let { page } = desktop;

  await expect(
    page.getByRole("button", { name: "Añadir juego", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();

  const language = page.getByRole("combobox", { name: "Idioma" });
  await language.selectOption("en");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add game", exact: true }),
  ).toBeVisible();

  page = await desktop.restart();
  await expect(
    page.getByRole("button", { name: "Add game", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Language" }),
  ).toHaveValue("en");
});
