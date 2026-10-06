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
      session("previous-year", "local-0", 2025, 12, 31, 3600),
      session("previous-month", "local-1", 2026, 9, 30, 3600),
      session("month-start", "local-0", 2026, 10, 1, 3600),
      session("previous-sunday", "local-0", 2026, 10, 4, 1800),
      session("current-monday", "local-1", 2026, 10, 5, 7200),
      session("current-tuesday", "local-0", 2026, 10, 6, 1800),
      session("steam-overlap", "local-0", 2026, 10, 6, 1800, "steam-sync"),
      session("next-monday", "local-1", 2026, 10, 12, 3600),
      session("next-month", "local-0", 2026, 11, 1, 3600),
      session("last-day", "local-1", 2026, 12, 31, 1800),
      session("next-year", "local-0", 2027, 1, 1, 3600),
      session("next-year-monday", "local-1", 2027, 1, 4, 7200),
      session("dst-sunday", "local-0", 2026, 3, 29, 3600),
      session("dst-monday", "local-1", 2026, 3, 30, 3600),
    ],
  },
});

test("limits weekly and monthly history and rankings to the current calendar period", async ({
  desktop,
}) => {
  const { page } = desktop;
  await page.clock.setFixedTime(new Date(2026, 9, 6, 14));
  const version = await desktop.app.evaluate(({ app }) => app.getVersion());
  await expect(page.getByTitle("Versión de Nemeton")).toHaveText(`v${version}`);
  await page.getByRole("button", { name: "Estadísticas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lo más destacado" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Histórico de juego" })).toBeVisible();
  await expect(page.getByText("RESUMEN AUTOMÁTICO", { exact: true })).toHaveCount(0);
  const selector = page.getByRole("combobox", { name: "Periodo del histórico" });
  const cards = page.locator(".month-card");
  const toggle = page.getByRole("group", { name: "Vista del histórico" });
  await selector.selectOption("week");
  await expect(
    page.getByRole("heading", { name: "Esta semana", exact: true }),
  ).toBeVisible();
  await expect(cards).toHaveCount(7);
  await expect(cards.nth(0)).toContainText("lunes");
  await expect(cards.nth(0)).toContainText("2 h");
  await expect(cards.nth(1)).toContainText("30 min");
  await expect(cards.nth(6)).toContainText("Sin actividad registrada");
  await expect(page.locator(".metric-grid")).toContainText("2.5 h");
  await toggle.getByRole("button", { name: "Ranking por horas" }).click();
  let ranking = page.getByRole("list", { name: "Ranking por horas de esta semana" });
  await expect(ranking.getByRole("listitem")).toHaveCount(2);
  await expect(ranking.getByRole("listitem").nth(0)).toContainText("Fixture 0001");
  await expect(ranking.getByRole("listitem").nth(0)).toContainText("2 h");
  await expect(ranking.getByRole("listitem").nth(1)).toContainText("30 min");
  await selector.selectOption("month");
  await expect(
    page.getByRole("heading", { name: "Este mes", exact: true }),
  ).toBeVisible();
  ranking = page.getByRole("list", { name: "Ranking por horas de este mes" });
  await expect(ranking.getByRole("listitem").nth(0)).toContainText("3 h");
  await expect(ranking.getByRole("listitem").nth(1)).toContainText("2 h");
  await expect(page.locator(".metric-grid")).toContainText("5 h");
  await toggle.getByRole("button", { name: "Por día", exact: true }).click();
  await expect(cards).toHaveCount(31);
  await expect(cards.nth(0)).toContainText("1 h");
  await selector.selectOption("2026");
  await expect(page.getByRole("heading", { name: "Tu año jugando" })).toBeVisible();
  await expect(cards).toHaveCount(12);
  await expect(page.locator(".metric-grid")).toContainText("9.5 h");
  await selector.selectOption("all");
  await expect(cards).toHaveCount(0);
});

test("keeps weeks across New Year and daylight-saving boundaries", async ({
  desktop,
}) => {
  const { page } = desktop;
  await page.clock.setFixedTime(new Date(2027, 0, 1, 14));
  await page.getByRole("button", { name: "Estadísticas", exact: true }).click();
  let selector = page.getByRole("combobox", { name: "Periodo del histórico" });
  await selector.selectOption("week");
  await expect(page.locator(".month-card")).toHaveCount(7);
  await expect(page.locator(".metric-grid")).toContainText("1.5 h");
  await selector.selectOption("month");
  await expect(page.locator(".metric-grid")).toContainText("3 h");
  await page.clock.setFixedTime(new Date(2026, 2, 30, 14));
  await page.reload();
  await page.getByRole("button", { name: "Estadísticas", exact: true }).click();
  selector = page.getByRole("combobox", { name: "Periodo del histórico" });
  await selector.selectOption("week");
  await expect(page.locator(".month-card")).toHaveCount(7);
  await expect(page.locator(".metric-grid")).toContainText("1 h");
});
