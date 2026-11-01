import { _electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const executable = process.argv[2];
if (!executable) throw new Error("Pass the packaged Nemeton executable path");
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-packaged-"));
const data = path.join(directory, "data");
await fs.mkdir(data, { recursive: true });
await fs.mkdir(path.join(directory, "steam/steamapps"), { recursive: true });
await fs.writeFile(
  path.join(data, "ludusavi-catalog.json"),
  JSON.stringify({ updatedAt: new Date().toISOString(), games: [] }),
);
let desktop;
const launch = async () => {
  desktop = await _electron.launch({
    executablePath: path.resolve(executable),
    args: [
      ...(process.platform === "linux" && process.env.CI ? ["--no-sandbox"] : []),
      "--host-resolver-rules=MAP * ~NOTFOUND",
    ],
    env: {
      ...process.env,
      NEMETON_E2E_DATA: data,
      NEMETON_STEAM_ROOT: path.join(directory, "steam"),
      NEMETON_EPIC_MANIFESTS: path.join(directory, "epic-manifests"),
      NEMETON_GOG_ROOT: path.join(directory, "gog-games"),
      ELECTRON_RENDERER_URL: "",
      PORTABLE_EXECUTABLE_DIR: "",
    },
  });
  const page = await desktop.firstWindow();
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: /^(Añadir juego|Add game)$/ }),
  ).toBeVisible();
  return page;
};
try {
  let page = await launch();
  await page.evaluate(() =>
    window.launcher.addLocalGame({ title: "Packaged smoke game", executablePath: "" }),
  );
  expect(
    (await page.evaluate(() => window.launcher.listGames())).games.some(
      (game) => game.title === "Packaged smoke game",
    ),
  ).toBe(true);
  await desktop.close();
  desktop = null;
  page = await launch();
  expect(
    (await page.evaluate(() => window.launcher.listGames())).games.some(
      (game) => game.title === "Packaged smoke game",
    ),
  ).toBe(true);
  await expect(page.locator(".app-shell")).toBeVisible();
  console.log("Packaged app smoke passed: renderer, preload, IPC and persistence.");
} finally {
  if (desktop) await desktop.close();
  await fs.rm(directory, { recursive: true, force: true });
}
