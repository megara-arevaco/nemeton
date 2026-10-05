import { test as base, expect, _electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LibraryGame } from "../packages/core/src/shared/types";
import type { LauncherApi } from "../apps/desktop/src/preload/index";

export const test = base.extend<{
  desktop: {
    app: ElectronApplication;
    page: Page;
    directory: string;
    restart: () => Promise<Page>;
  };
  gameCount: number;
}>({
  gameCount: [0, { option: true }],
  desktop: async ({ gameCount }, use, testInfo) => {
    // Windows runners may expose an 8.3 alias in TEMP. Restore validation
    // requires canonical paths so it can reject redirected directories.
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const directory = await fs.mkdtemp(path.join(temporaryRoot, "nemeton-e2e-"));
    const data = path.join(directory, "data");
    await fs.mkdir(data);
    await fs.writeFile(
      path.join(data, "ludusavi-catalog.json"),
      JSON.stringify({ updatedAt: new Date().toISOString(), games: [] }),
    );
    const games: LibraryGame[] = Array.from({ length: gameCount }, (_, index) => ({
      id: `local-${index}`,
      source: "local",
      sourceId: `fixture-${index}`,
      title: `Fixture ${String(index).padStart(4, "0")}`,
      installPath: "",
      launchUri: null,
      coverPath: null,
      coverUrl: null,
      heroUrl: null,
      playtimeMinutes: 0,
      playtimeSecondsRemainder: 0,
      platformPlaytimeMinutes: null,
      trackedPlaytimeSeconds: 0,
      installed: false,
      lastPlayedAt: null,
      importedAt: new Date().toISOString(),
    }));
    await fs.writeFile(
      path.join(data, "library.json"),
      JSON.stringify({ version: 1, games, sessions: [], excludedGameKeys: [] }),
    );
    const require = createRequire(path.resolve("apps/desktop/package.json"));
    let app: ElectronApplication | undefined;
    const launch = async () => {
      app = await _electron.launch({
        executablePath: require("electron") as string,
        args: [
          ...(process.platform === "linux" && process.env.CI ? ["--no-sandbox"] : []),
          path.resolve("e2e/bootstrap.cjs"),
        ],
        env: { ...process.env, NEMETON_E2E_DATA: data, ELECTRON_RENDERER_URL: "" },
      });
      await app
        .context()
        .tracing.start({ screenshots: true, snapshots: true, sources: true });
      const page = await app.firstWindow();
      await expect(
        page.getByRole("button", { name: "Añadir juego", exact: true }),
      ).toBeVisible();
      await page.evaluate(() =>
        (window as unknown as { launcher: LauncherApi }).launcher.listGames(),
      );
      return page;
    };

    try {
      const page = await launch();
      await use({
        app: app!,
        page,
        directory,
        restart: async () => {
          await app!.context().tracing.stop();
          await app!.close();
          return launch();
        },
      });
    } finally {
      if (app) {
        const failed = testInfo.status !== testInfo.expectedStatus;

        if (failed) {
          const screenshot = testInfo.outputPath("failure.png");
          const window = app.windows()[0];

          if (window && !window.isClosed()) {
            await window.screenshot({ path: screenshot });
            await testInfo.attach("screenshot", {
              path: screenshot,
              contentType: "image/png",
            });
          }
        }

        const trace = testInfo.outputPath("trace.zip");
        await app.context().tracing.stop(failed ? { path: trace } : {});
        if (failed) {
          await testInfo.attach("trace", {
            path: trace,
            contentType: "application/zip",
          });
        }
      }
      await app?.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
});
export { expect };
