import { test, expect } from "./fixtures";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  discoverLocalFolder,
  LocalFolderImportService,
} from "../apps/desktop/src/main/local-folder-import";
import { LibraryStore } from "../packages/core/src/library/store";

async function executable(filename: string) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, "fixture");
}

test("folder discovery groups game binaries and excludes helpers, links and already imported games", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "nemeton-folder-discovery-"),
  );

  try {
    const root = path.join(directory, "games");
    const alpha = path.join(root, "Alpha", "Alpha.exe");
    await executable(alpha);
    await executable(path.join(root, "Alpha", "Launcher.exe"));
    await executable(path.join(root, "Alpha", "unins000.exe"));
    await executable(
      path.join(root, "Beta", "Binaries", "Win64", "Beta-Win64-Shipping.exe"),
    );
    await executable(
      path.join(root, "Beta", "Engine", "Binaries", "CrashReportClient.exe"),
    );
    await executable(path.join(root, "Beta", "_CommonRedist", "vc_redist.exe"));
    await executable(path.join(root, "Helpers", "setup.exe"));
    if (process.platform !== "win32") {
      await executable(path.join(directory, "outside", "Outside.exe"));
      await fs.symlink(path.join(directory, "outside"), path.join(root, "Linked"));
    }

    const store = new LibraryStore(path.join(directory, "library.json"));
    await store.addLocal({ title: "Already added Alpha", executablePath: alpha });
    const scan = await discoverLocalFolder(root, (await store.read()).games);
    expect(scan.candidates.map((game) => game.title)).toEqual(["Alpha", "Beta"]);
    expect(scan.candidates[0]?.executables).toHaveLength(2);
    expect(scan.candidates[0]?.alreadyAdded).toBe(true);
    expect(scan.candidates[1]?.executables[0]).toContain("Beta-Win64-Shipping.exe");
    expect(scan.candidates[1]?.alreadyAdded).toBe(false);
    expect(scan.truncated).toBe(false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("folder imports validate every selection before writing and are idempotent", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-folder-import-"));

  try {
    const root = path.join(directory, "games");
    const alpha = path.join(root, "Alpha", "Alpha.exe"),
      beta = path.join(root, "Beta", "Beta.exe");
    await executable(alpha);
    await executable(beta);
    const store = new LibraryStore(path.join(directory, "library.json"));
    const service = new LocalFolderImportService(store);
    const scan = await service.scan(root);
    const selections = scan.candidates.map((candidate) => ({
      candidateId: candidate.id,
      title: `Validated ${candidate.title}`,
      executablePath: candidate.executables[0]!,
    }));
    await fs.unlink(beta);
    await expect(service.import(scan.scanId, selections)).rejects.toThrow(
      /ya no está disponible/,
    );
    expect((await store.read()).games).toHaveLength(0);
    await executable(beta);
    await expect(
      service.import(scan.scanId, [
        { ...selections[0]!, executablePath: path.join(directory, "other.exe") },
      ]),
    ).rejects.toThrow(/Revisa/);
    expect((await store.read()).games).toHaveLength(0);
    const result = await service.import(scan.scanId, selections);
    expect(result.addedCount).toBe(2);
    expect(
      result.snapshot.games.every(
        (game) => game.installed && game.title.startsWith("Validated"),
      ),
    ).toBe(true);
    const repeated = await service.import(scan.scanId, selections);
    expect(repeated.addedCount).toBe(0);
    expect(repeated.skippedCount).toBe(2);
    expect(
      (await service.scan(root)).candidates.every(
        (candidate) => candidate.alreadyAdded,
      ),
    ).toBe(true);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("user validates detected names and executables and explicitly confirms before importing", async ({
  desktop,
}) => {
  const root = path.join(desktop.directory, "games");
  const alpha = path.join(root, "Alpha", "Alpha.exe");
  const beta = path.join(root, "Beta", "Binaries", "Win64", "Beta-Win64-Shipping.exe");
  const launcher = path.join(root, "Beta", "BetaLauncher.exe");
  await executable(alpha);
  await executable(beta);
  await executable(launcher);
  await executable(path.join(root, "Beta", "uninstall.exe"));
  await desktop.page.evaluate(async (executablePath) => {
    await window.launcher.addLocalGame({ title: "Existing Alpha", executablePath });
  }, alpha);
  let page = await desktop.restart();
  await desktop.app.evaluate(() => {
    globalThis.fetch = async (input) => {
      const url = String(input);

      if (url.includes("storesearch")) {
        return new Response(
          JSON.stringify({ items: [{ id: 10, name: "Validated Beta" }] }),
        );
      }
      if (url.includes("appdetails")) {
        return new Response(
          JSON.stringify({
            "10": {
              success: true,
              data: {
                header_image: "https://example.com/beta-cover.jpg",
                background: "https://example.com/beta-hero.jpg",
              },
            },
          }),
        );
      }
      return new Response(JSON.stringify({}));
    };
  });
  await desktop.app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
  }, root);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Añadir juego", exact: true })
    .click();
  await page.getByRole("button", { name: "Escanear carpeta", exact: true }).click();
  let modal = page.getByRole("dialog", { name: "Escanear carpeta", exact: true });
  await modal.getByRole("button", { name: "Elegir carpeta", exact: true }).click();
  await expect(
    modal.getByText("2 posibles juegos detectados", { exact: true }),
  ).toBeVisible();
  const alphaRow = modal.getByRole("group", { name: "Alpha", exact: true });
  await expect(alphaRow.getByText("Ya en biblioteca", { exact: true })).toBeVisible();
  const betaRow = modal.getByRole("group", { name: "Beta", exact: true });
  const validate = betaRow.getByRole("checkbox", { name: "Validar Beta", exact: true });
  await expect(validate).not.toBeChecked();
  await expect(
    modal.getByRole("button", { name: "Revisar selección (0)", exact: true }),
  ).toBeDisabled();
  await validate.check();
  await betaRow.getByLabel("Nombre del juego", { exact: true }).fill("Validated Beta");
  await expect(validate).not.toBeChecked();
  await betaRow.getByLabel("Ejecutable", { exact: true }).selectOption(launcher);
  await validate.check();
  expect((await page.evaluate(() => window.launcher.listGames())).games).toHaveLength(
    1,
  );
  await modal
    .getByRole("button", { name: "Revisar selección (1)", exact: true })
    .click();
  await expect(modal.getByText("Validated Beta", { exact: true })).toBeVisible();
  await expect(modal.getByText(launcher, { exact: true })).toBeVisible();
  expect((await page.evaluate(() => window.launcher.listGames())).games).toHaveLength(
    1,
  );
  await modal.getByRole("button", { name: "Volver a validar", exact: true }).click();
  await expect(validate).toBeChecked();
  await modal
    .getByRole("button", { name: "Revisar selección (1)", exact: true })
    .click();
  await modal.getByRole("button", { name: /^Confirmar y añadir 1 juego/ }).click();
  modal = page.getByRole("dialog", { name: "Importación completada", exact: true });
  await expect(modal.getByText(/Se ha(?:n)? añadido 1 juego/)).toBeVisible();
  await modal.getByRole("button", { name: "Ver biblioteca", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const snapshot = await page.evaluate(() => window.launcher.listGames());
  expect(snapshot.games).toHaveLength(2);
  expect(snapshot.games.find((game) => game.title === "Validated Beta")).toMatchObject({
    installPath: launcher,
    installed: true,
    steamAppId: "10",
    coverUrl: "https://example.com/beta-cover.jpg",
    heroUrl: "https://example.com/beta-hero.jpg",
  });
  await expect(
    page
      .getByRole("group", { name: /^Lista de juegos/ })
      .getByText("Validated Beta", { exact: true }),
  ).toBeVisible();
  page = await desktop.restart();
  expect((await page.evaluate(() => window.launcher.listGames())).games).toHaveLength(
    2,
  );
  // A new scan marks both installations as existing and cannot duplicate them.
  await desktop.app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
  }, root);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Añadir juego", exact: true })
    .click();
  await page.getByRole("button", { name: "Escanear carpeta", exact: true }).click();
  modal = page.getByRole("dialog", { name: "Escanear carpeta", exact: true });
  await modal.getByRole("button", { name: "Elegir carpeta", exact: true }).click();
  await expect(modal.getByText("Ya en biblioteca", { exact: true })).toHaveCount(2);
  await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect((await page.evaluate(() => window.launcher.listGames())).games).toHaveLength(
    2,
  );
});

test("cancelling folder selection leaves the library unchanged", async ({
  desktop,
}) => {
  const { page, app } = desktop;
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Añadir juego", exact: true })
    .click();
  await page.getByRole("button", { name: "Escanear carpeta", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Escanear carpeta", exact: true });
  await modal.getByRole("button", { name: "Elegir carpeta", exact: true }).click();
  await expect(
    modal.getByRole("button", { name: "Elegir carpeta", exact: true }),
  ).toBeEnabled();
  await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect((await page.evaluate(() => window.launcher.listGames())).games).toHaveLength(
    0,
  );
});
