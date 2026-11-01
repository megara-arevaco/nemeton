import { test, expect } from "./fixtures";
import fs from "node:fs/promises";
import path from "node:path";

test.use({ gameCount: 8 });

test("recent activity shows five distinct games ordered by latest play, including uninstalled copies and sessions", async ({
  desktop,
}) => {
  const filename = path.join(desktop.directory, "data/library.json");
  const snapshot = JSON.parse(await fs.readFile(filename, "utf8"));
  const dates = [
    "2026-01-01",
    null,
    "2026-01-08",
    "2026-01-07",
    "2026-01-06",
    "2026-01-05",
    "2026-01-09",
    null,
  ];
  snapshot.games.forEach(
    (game: { lastPlayedAt: string | null; canonicalId?: string }, index: number) => {
      game.lastPlayedAt = dates[index] ? `${dates[index]}T12:00:00.000Z` : null;
      if (index === 5 || index === 6) {
        game.canonicalId = "same-game";
      }
    },
  );
  snapshot.sessions = [10, 9].map((day) => ({
    id: `recent-${day}`,
    gameId: "local-1",
    startedAt: `2026-01-${String(day).padStart(2, "0")}T11:00:00.000Z`,
    endedAt: `2026-01-${String(day).padStart(2, "0")}T12:00:00.000Z`,
    durationSeconds: 3600,
    origin: "launcher",
  }));
  await fs.writeFile(filename, JSON.stringify(snapshot));
  const page = await desktop.restart();
  const recent = page.getByRole("group", { name: "Actividad reciente", exact: true });
  const titles = await recent
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.querySelector("strong")?.textContent),
    );
  expect(titles).toEqual([
    "Fixture 0001",
    "Fixture 0005",
    "Fixture 0002",
    "Fixture 0003",
    "Fixture 0004",
  ]);
  const recentBox = await page
    .getByRole("region", { name: "Actividad reciente", exact: true })
    .boundingBox();
  const toggle = page.getByRole("button", { name: "Tu colección", exact: true });
  const collectionBox = await toggle.boundingBox();
  expect(recentBox!.y + recentBox!.height).toBeLessThan(collectionBox!.y);
  const collection = page.locator(".installed-section");
  await collection
    .getByRole("checkbox", { name: "Solo instalados", exact: true })
    .check();
  await expect(
    collection.getByText("No hay juegos con estos filtros", { exact: true }),
  ).toBeVisible();
  await expect(recent.getByRole("button")).toHaveCount(5);
  await collection
    .getByRole("checkbox", { name: "Solo instalados", exact: true })
    .uncheck();
  await expect(
    collection
      .getByRole("group", { name: /^Juegos de la biblioteca/ })
      .getByRole("button"),
  ).toHaveCount(7);
  await recent.getByRole("button", { name: /^Fixture 0005,/ }).click();
  await expect(
    page.getByRole("heading", { name: "Fixture 0005", exact: true }),
  ).toBeVisible();
});

test("collection folds with the keyboard, remembers its state and keeps the installed filter inside", async ({
  desktop,
}) => {
  let page = desktop.page;
  let toggle = page.getByRole("button", { name: "Tu colección", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    page
      .locator(".installed-section")
      .getByRole("checkbox", { name: "Solo instalados", exact: true }),
  ).toBeVisible();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("group", { name: /^Juegos de la biblioteca/ }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Solo instalados", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("region", { name: "Actividad reciente", exact: true }),
  ).toBeVisible();
  page = await desktop.restart();
  toggle = page.getByRole("button", { name: "Tu colección", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("group", { name: /^Juegos de la biblioteca/ }).getByRole("button"),
  ).toHaveCount(8);
});
