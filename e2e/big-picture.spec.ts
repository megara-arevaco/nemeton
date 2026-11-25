import fs from "node:fs/promises";
import path from "node:path";
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

test("Tab cycles between Big Picture sections and keeps focus on the active section", async ({
  desktop,
}) => {
  const { page } = desktop;
  await page.getByRole("button", { name: "Entrar en Big Picture" }).click();
  const mode = page.getByRole("main", { name: "Big Picture" });
  const library = mode.getByRole("button", { name: "Juegos instalados" });
  const statistics = mode.getByRole("button", { name: "Estadísticas", exact: true });

  await page.keyboard.press("Tab");
  await expect(statistics).toBeFocused();
  await expect(statistics).toHaveAttribute("aria-pressed", "true");
  await expect(mode.getByRole("heading", { name: "Estadísticas" })).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(library).toBeFocused();
  await expect(library).toHaveAttribute("aria-pressed", "true");
  await expect(mode.getByRole("heading", { name: "Juegos instalados" })).toBeVisible();

  await page.keyboard.press("Shift+Tab");
  await expect(statistics).toBeFocused();
});

test("Big Picture updates playtime and achievement status when the highlight moves", async ({
  desktop,
}) => {
  const { page, directory } = desktop;

  for (const [title, playtimeMinutes] of [
    ["Alpha", 120],
    ["Beta", 45],
  ] as const) {
    const executablePath = path.join(directory, `${title}.exe`);
    await fs.writeFile(executablePath, "fixture");
    await page.evaluate(
      async ({ title, executablePath, playtimeMinutes }) => {
        const snapshot = await window.launcher.addLocalGame({ title, executablePath });
        const game = snapshot.games.find((entry) => entry.title === title)!;
        await window.launcher.updateLocalGame(game.id, {
          title,
          executablePath,
          playtimeMinutes,
        });
      },
      { title, executablePath, playtimeMinutes },
    );
  }

  await page.getByRole("button", { name: "Entrar en Big Picture" }).click();
  const mode = page.getByRole("main", { name: "Big Picture" });
  await mode.getByRole("button", { name: "Alpha", exact: true }).focus();
  await expect(mode.getByRole("heading", { name: "Alpha" })).toBeVisible();
  await expect(mode.getByText(/2 h/)).toBeVisible();
  await expect(mode.getByText("Logros sin datos")).toBeVisible();
  await mode.getByRole("button", { name: "Beta", exact: true }).focus();
  await expect(mode.getByRole("heading", { name: "Beta" })).toBeVisible();
  await expect(mode.getByText(/45 min/)).toBeVisible();
});

test("Windows records a local game's session and includes it in Big Picture statistics", async ({
  desktop,
}) => {
  test.skip(process.platform !== "win32", "Uses a Windows local game fixture");
  const { page, directory } = desktop;
  const executablePath = path.join(directory, "session-fixture.cmd");
  await fs.writeFile(
    executablePath,
    '@echo off\r\n"%SystemRoot%\\System32\\ping.exe" -n 8 127.0.0.1 >nul\r\n',
  );
  const gameId = await page.evaluate(async (executablePath) => {
    const snapshot = await window.launcher.addLocalGame({
      title: "Session Fixture",
      executablePath,
    });

    return snapshot.games.find((game) => game.title === "Session Fixture")!.id;
  }, executablePath);
  await page.evaluate((id) => window.launcher.launchGame(id), gameId);
  await expect
    .poll(
      async () =>
        page.evaluate(async (id) => {
          const { sessions } = await window.launcher.listGames();

          return (
            sessions.find((session) => session.gameId === id)?.durationSeconds ?? 0
          );
        }, gameId),
      { timeout: 20_000 },
    )
    .toBeGreaterThanOrEqual(5);

  await page.getByRole("button", { name: "Entrar en Big Picture" }).click();
  await page.keyboard.press("Tab");
  const mode = page.getByRole("main", { name: "Big Picture" });
  await expect(mode.getByRole("heading", { name: "Estadísticas" })).toBeVisible();
  await expect(
    mode.getByRole("listitem").filter({ hasText: "Session Fixture" }),
  ).toBeVisible();
});
