import { test, expect } from "./fixtures";
import fs from "node:fs/promises";
import path from "node:path";

test("startup recovery refuses journal paths outside configured save folders", async ({
  desktop,
}) => {
  const { directory, restart } = desktop;
  const dataDirectory = path.join(directory, "data");
  const root = path.join(directory, "unregistered-root");
  const stage = path.join(directory, ".nemeton-restore-abcdef");
  const previous = `${stage}.previous`;
  await fs.mkdir(root);
  await fs.mkdir(stage);
  await fs.mkdir(previous);
  await fs.writeFile(path.join(root, "sentinel.txt"), "root remains untouched");
  await fs.writeFile(path.join(stage, "sentinel.txt"), "staging remains untouched");
  await fs.writeFile(path.join(previous, "sentinel.txt"), "previous remains untouched");
  await fs.writeFile(
    path.join(dataDirectory, "savegames.json.restore.json"),
    JSON.stringify({
      committed: false,
      directories: [{ root, stage, previous }],
    }),
  );

  const page = await restart();
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(fs.readFile(path.join(root, "sentinel.txt"), "utf8")).resolves.toBe(
    "root remains untouched",
  );
  await expect(fs.readFile(path.join(stage, "sentinel.txt"), "utf8")).resolves.toBe(
    "staging remains untouched",
  );
  await expect(fs.readFile(path.join(previous, "sentinel.txt"), "utf8")).resolves.toBe(
    "previous remains untouched",
  );
});

test.describe("manual recovery of orphan sessions", () => {
  test.use({
    gameCount: 1,
    sessionData: {
      sessions: [
        {
          id: "orphan-reassign",
          gameId: "deleted-fixture-game",
          startedAt: "2025-04-04T12:00:00.000Z",
          endedAt: "2025-04-04T12:15:00.000Z",
          durationSeconds: 900,
          origin: "launcher",
        },
        {
          id: "orphan-discard",
          gameId: "another-deleted-fixture",
          startedAt: "2025-04-03T12:00:00.000Z",
          endedAt: "2025-04-03T12:05:00.000Z",
          durationSeconds: 300,
          origin: "launcher",
        },
      ],
    },
  });

  test("previews, confirms, and backs up each explicit reassignment or discard", async ({
    desktop,
  }) => {
    const { app, page, directory } = desktop;
    const importFile = path.join(directory, "portable-empty.json");
    await fs.writeFile(
      importFile,
      JSON.stringify({
        format: "nemeton-portable-data",
        version: 1,
        exportedAt: "2025-04-05T12:00:00.000Z",
        preferences: { language: "es", accentTheme: "forest" },
        library: { version: 1, games: [], sessions: [], excludedGameKeys: [] },
        achievementHistory: [],
        savegamePolicies: {},
      }),
    );
    await app.evaluate(({ dialog }, input) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
    }, importFile);
    const original = await page.evaluate(() => window.launcher.listGames());
    expect(original.sessions).toHaveLength(2);

    await page.getByRole("button", { name: "Ajustes", exact: true }).click();
    await page.getByRole("button", { name: "Importar datos", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("orphan sessions");
    expect(await page.evaluate(() => window.launcher.listGames())).toEqual(original);

    const reassignment = page.getByLabel("Decisión manual para sesión orphan-reassign");
    const discard = page.getByLabel("Decisión manual para sesión orphan-discard");
    await reassignment.selectOption("local-0");
    await expect(
      page.getByText("Decisiones listas para confirmar: 1", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Revisar y aplicar…", exact: true }),
    ).toBeEnabled();
    expect(await page.evaluate(() => window.launcher.listGames())).toEqual(original);

    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    });
    await page.getByRole("button", { name: "Revisar y aplicar…", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "Reasignadas: 1 · descartadas explícitamente: 0",
    );
    let repaired = await page.evaluate(() => window.launcher.listGames());
    expect(repaired.sessions).toEqual([
      expect.objectContaining({ id: "orphan-reassign", gameId: "local-0" }),
      expect.objectContaining({
        id: "orphan-discard",
        gameId: "another-deleted-fixture",
      }),
    ]);
    expect(
      await page.evaluate(() => window.launcher.getSessionDiagnostics()),
    ).toMatchObject({ orphanCount: 1 });

    const reassignBackups = (await fs.readdir(path.join(directory, "data"))).filter(
      (name) =>
        name.startsWith("library.json.before-session-repair-") && name.endsWith(".bak"),
    );
    expect(reassignBackups).toHaveLength(1);
    await expect(discard).toHaveValue("");
    await discard.selectOption("discard");
    await page.getByRole("button", { name: "Revisar y aplicar…", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "Reasignadas: 0 · descartadas explícitamente: 1",
    );
    repaired = await page.evaluate(() => window.launcher.listGames());
    expect(repaired.sessions).toEqual([
      expect.objectContaining({ id: "orphan-reassign", gameId: "local-0" }),
    ]);
    await expect(
      page.getByText("No se detectaron sesiones huérfanas.", { exact: true }),
    ).toBeVisible();
    const allBackups = (await fs.readdir(path.join(directory, "data"))).filter(
      (name) =>
        name.startsWith("library.json.before-session-repair-") && name.endsWith(".bak"),
    );
    expect(allBackups).toHaveLength(2);
  });
});
