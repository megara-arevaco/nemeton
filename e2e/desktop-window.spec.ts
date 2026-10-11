import { test, expect } from "./fixtures";

test("E2E windows stay hidden unless visible debugging is requested", async ({
  desktop,
}) => {
  const windows = await desktop.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => ({
      visible: window.isVisible(),
      backgroundThrottling: window.webContents.getBackgroundThrottling(),
    })),
  );
  const headed = process.env.NEMETON_E2E_HEADED === "1";
  expect(windows).toHaveLength(1);
  expect(windows[0]).toEqual({
    visible: headed,
    backgroundThrottling: headed,
  });
});
