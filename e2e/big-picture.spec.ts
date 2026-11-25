import { test, expect } from "./fixtures";

test("Big Picture filters games, supports keyboard navigation and returns to desktop", async ({
  desktop,
}) => {
  const { page } = desktop;
  await page.getByRole("button", { name: "Entrar en Big Picture" }).click();
  const mode = page.getByRole("main", { name: "Big Picture" });
  await expect(mode).toBeVisible();
  await expect(
    mode.getByRole("heading", { name: "No hay juegos en esta vista" }),
  ).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(
    mode.getByRole("button", { name: "Instalados", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    mode.getByRole("button", { name: "Instalados", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(mode).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Entrar en Big Picture" }),
  ).toBeVisible();
});
