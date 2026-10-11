import { test, expect } from "./fixtures";

test("updates are safely disabled in development and translated", async ({
  desktop,
}) => {
  const { page } = desktop;
  const initial = await page.evaluate(() => window.launcher.getAppUpdateState());
  expect(initial.status).toBe("unsupported");
  expect(initial.reason).toBe("development");
  expect(await page.evaluate(() => window.launcher.checkAppUpdates())).toEqual(initial);
  expect(await page.evaluate(() => window.launcher.downloadAppUpdate())).toEqual(
    initial,
  );
  await page.evaluate(() => window.launcher.installAppUpdate());
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Actualizaciones de Nemeton" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Desactivada en desarrollo; no se consultan ni descargan versiones.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Buscar actualizaciones" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reiniciar e instalar" })).toHaveCount(
    0,
  );
  await page.getByRole("combobox", { name: "Idioma" }).selectOption("en");
  await expect(page.getByRole("heading", { name: "Nemeton updates" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Releases" })).toBeVisible();
});

test("update events show availability, progress, installation and errors", async ({
  desktop,
}) => {
  const { page, app } = desktop;
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Actualizaciones de Nemeton" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Desactivada en desarrollo; no se consultan ni descargan versiones.",
    ),
  ).toBeVisible();
  const broadcast = (status: "available" | "downloading" | "downloaded" | "error") =>
    app.evaluate(({ BrowserWindow }, nextStatus) => {
      BrowserWindow.getAllWindows()[0].webContents.send("updates:changed", {
        status: nextStatus,
        currentVersion: "0.1.7",
        availableVersion: "0.1.8",
        progress: 42,
        error: nextStatus === "error" ? "failure" : null,
        reason: null,
      });
    }, status);
  await broadcast("available");
  await expect(page.getByText("Nueva versión disponible: 0.1.8")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Descargar actualización" }),
  ).toBeEnabled();
  await broadcast("downloading");
  await expect(page.getByText("Descargando: 42 %")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Buscar actualizaciones" }),
  ).toBeDisabled();
  await broadcast("downloaded");
  await expect(
    page.getByRole("button", { name: "Reiniciar e instalar" }),
  ).toBeEnabled();
  await broadcast("error");
  await expect(
    page.getByText(
      "No se pudo actualizar. Comprueba tu conexión y vuelve a intentarlo.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Buscar actualizaciones" }),
  ).toBeEnabled();
});
