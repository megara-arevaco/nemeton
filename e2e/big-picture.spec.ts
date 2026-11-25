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

test("Big Picture shows statistics and returns to its library before exiting", async ({
  desktop,
}) => {
  const { page } = desktop;
  await page.getByRole("button", { name: "Entrar en Big Picture" }).click();
  const mode = page.getByRole("main", { name: "Big Picture" });
  await page.keyboard.press("ArrowLeft");
  const sound = mode.getByRole("button", { name: "Música ambiental" });
  await expect(sound).toBeFocused();
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("ArrowLeft");
  const stats = mode.getByRole("button", { name: "Estadísticas", exact: true });
  await expect(stats).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    mode.getByRole("heading", { name: "Estadísticas", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(mode.getByRole("heading", { name: "Juegos instalados" })).toBeVisible();
  await expect(mode.getByRole("button", { name: "Juegos instalados" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(mode).toHaveCount(0);
});
