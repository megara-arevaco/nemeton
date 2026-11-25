import { test, expect } from "./fixtures";

test("Big Picture shows the installed library and returns to desktop with Escape", async ({
  desktop,
}) => {
  const { page } = desktop;
  await page.getByRole("button", { name: "Entrar en Big Picture" }).click();
  const mode = page.getByRole("main", { name: "Big Picture" });
  await expect(mode).toBeVisible();
  await expect(mode.getByRole("heading", { name: "Juegos instalados" })).toBeVisible();
  await expect(
    mode.getByRole("button", { name: "Volver al escritorio" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(mode).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Entrar en Big Picture" }),
  ).toBeVisible();
});
