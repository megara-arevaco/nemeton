import { test, expect } from "./fixtures";

const image =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="620"><rect width="1920" height="620" fill="#f28b30"/><circle cx="1400" cy="310" r="250" fill="#42b5d9"/></svg>';

for (const available of [true, false]) {
  test(
    available
      ? "hero falls back to the game scene when the wide banner is unavailable"
      : "hero restores the ambient background when all images fail",
    async ({ desktop }) => {
      await desktop.page.evaluate(async () => {
        await window.launcher.addLocalGame({
          title: "Hero fixture",
          executablePath: "",
          steamAppId: "10",
          coverUrl: "https://assets.test/cover.svg",
          heroUrl: "https://assets.test/scene.svg",
        });
      });
      const page = await desktop.restart();
      await desktop.app.evaluate(({ session }) => {
        session.defaultSession.webRequest.onBeforeRequest((_details, callback) =>
          callback({ cancel: false }),
        );
      });
      const requested: string[] = [];
      await page.route("https://**/*", async (route) => {
        const url = route.request().url();
        requested.push(url);
        if (available && url === "https://assets.test/scene.svg") {
          await route.fulfill({ contentType: "image/svg+xml", body: image });
        } else {
          await route.fulfill({ status: 404, body: "missing" });
        }
      });
      await page
        .getByRole("group", { name: /^Juegos de la biblioteca/ })
        .getByRole("button", { name: /^Hero fixture,/ })
        .click();
      const hero = page.locator(".game-hero");
      await expect(
        page.getByRole("heading", { name: "Hero fixture", exact: true }),
      ).toBeVisible();
      if (available) {
        await expect(hero.locator(".hero-art")).toHaveAttribute(
          "src",
          "https://assets.test/scene.svg",
        );
        await expect
          .poll(() =>
            hero.locator(".hero-art").evaluate((element) => {
              const img = element as HTMLImageElement;
              return img.complete && img.naturalWidth > 0;
            }),
          )
          .toBe(true);
        expect(requested.some((url) => url.endsWith("/library_hero.jpg"))).toBe(true);
      } else {
        await expect(hero.locator(".hero-art")).toHaveCount(0);
        await expect
          .poll(() =>
            hero
              .locator(".ambient")
              .evaluate((element) => getComputedStyle(element, "::after").content),
          )
          .not.toBe("none");
      }
    },
  );
}

test("stored Steam page decoration is skipped in favor of the wide library banner", async ({
  desktop,
}) => {
  await desktop.page.evaluate(async () => {
    await window.launcher.addLocalGame({
      title: "Wide hero fixture",
      executablePath: "",
      steamAppId: "10",
      heroUrl: "https://store.akamai.steamstatic.com/images/storepagebackground/app/10",
      coverUrl: "https://assets.test/cover.svg",
    });
  });
  const page = await desktop.restart();
  await desktop.app.evaluate(({ session }) => {
    session.defaultSession.webRequest.onBeforeRequest((_details, callback) =>
      callback({ cancel: false }),
    );
  });
  const requested: string[] = [];
  await page.route("https://**/*", async (route) => {
    const url = route.request().url();
    requested.push(url);
    if (url.endsWith("/library_hero.jpg")) {
      await route.fulfill({ contentType: "image/svg+xml", body: image });
    } else {
      await route.fulfill({ status: 404, body: "missing" });
    }
  });
  await page
    .getByRole("group", { name: /^Juegos de la biblioteca/ })
    .getByRole("button", { name: /^Wide hero fixture,/ })
    .click();
  await expect(page.locator(".game-hero .hero-art")).toHaveAttribute(
    "src",
    /library_hero\.jpg$/,
  );
  await expect
    .poll(() =>
      page
        .locator(".game-hero .hero-art")
        .evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBe(1920);
  expect(requested.some((url) => url.includes("storepagebackground"))).toBe(false);
});
