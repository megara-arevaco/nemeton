import { test, expect } from "./fixtures";
import type { GameSession } from "../packages/core/src/shared/types";

const session = (
  id: string,
  gameId: string,
  year: number,
  month: number,
  day: number,
  durationSeconds: number,
  origin: GameSession["origin"] = "launcher",
): GameSession => ({
  id,
  gameId,
  startedAt: new Date(year, month - 1, day, 10).toISOString(),
  endedAt: new Date(year, month - 1, day, 12).toISOString(),
  durationSeconds,
  origin,
});

test.use({
  gameCount: 2,
  sessionData: {
    sessions: [
      session("old-year", "local-0", 2025, 12, 31, 3600),
      session("first-day", "local-0", 2026, 1, 1, 3600),
      session("steam-overlap", "local-0", 2026, 1, 1, 3600, "steam-sync"),
      session("sunday", "local-0", 2026, 1, 4, 1800),
      session("monday", "local-1", 2026, 1, 5, 7200),
      session("dst-sunday", "local-0", 2026, 3, 29, 3600),
      session("dst-monday", "local-1", 2026, 3, 30, 3600),
      session("last-day", "local-1", 2026, 12, 31, 1800),
      session("next-year", "local-1", 2027, 1, 1, 3600),
    ],
  },
});

test("groups the 2026 history by week and keeps annual and all-time views", async ({
  desktop,
}) => {
  const { page } = desktop;
  const version = await desktop.app.evaluate(({ app }) => app.getVersion());
  await expect(page.getByTitle("Versión de Nemeton")).toHaveText(`v${version}`);
  await page.getByRole("button", { name: "Estadísticas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lo más destacado" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Histórico de juego" })).toBeVisible();
  await expect(page.getByText("RESUMEN AUTOMÁTICO", { exact: true })).toHaveCount(0);
  const selector = page.getByRole("combobox", { name: "Periodo del histórico" });
  await selector.selectOption("weekly-2026");
  await expect(
    page.getByRole("heading", { name: "Tu 2026 por semanas" }),
  ).toBeVisible();
  const weeks = page.locator(".month-card");
  await expect(weeks).toHaveCount(53);
  await expect(weeks.nth(0)).toContainText("Semana 1");
  await expect(weeks.nth(0)).toContainText("Fixture 0000");
  await expect(weeks.nth(0)).toContainText("1.5 h");
  await expect(weeks.nth(1)).toContainText("Fixture 0001");
  await expect(weeks.nth(1)).toContainText("2 h");
  await expect(weeks.nth(12)).toContainText("Fixture 0000");
  await expect(weeks.nth(13)).toContainText("Fixture 0001");
  await expect(weeks.nth(52)).toContainText("30 min");
  const toggle = page.getByRole("group", { name: "Vista del histórico" });
  await toggle.getByRole("button", { name: "Ranking por horas" }).click();
  const ranking = page.getByRole("list", { name: "Ranking por horas de 2026" });
  await expect(ranking.getByRole("listitem")).toHaveCount(2);
  await expect(ranking.getByRole("listitem").nth(0)).toContainText("Fixture 0001");
  await expect(ranking.getByRole("listitem").nth(0)).toContainText("3.5 h");
  await expect(ranking.getByRole("listitem").nth(1)).toContainText("Fixture 0000");
  await expect(ranking.getByRole("listitem").nth(1)).toContainText("2.5 h");
  await expect(weeks).toHaveCount(0);
  await toggle.getByRole("button", { name: "Por semana", exact: true }).click();
  await expect(weeks).toHaveCount(53);
  await selector.selectOption("2026");
  await expect(page.getByRole("heading", { name: "Tu año jugando" })).toBeVisible();
  await expect(page.locator(".month-card")).toHaveCount(12);
  await expect(page.locator(".metric-grid")).toContainText("6 h");
  await toggle.getByRole("button", { name: "Ranking por horas" }).click();
  await expect(ranking.getByRole("listitem")).toHaveCount(2);
  await toggle.getByRole("button", { name: "Por mes", exact: true }).click();
  await expect(page.locator(".month-card")).toHaveCount(12);
  await selector.selectOption("all");
  await expect(page.locator(".month-card")).toHaveCount(0);
});
