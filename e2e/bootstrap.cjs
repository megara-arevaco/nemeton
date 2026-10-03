const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, session } = require("electron");

if (!process.env.NEMETON_E2E_DATA) {
  throw new Error("E2E requires an isolated user-data directory");
}
app.setPath("userData", process.env.NEMETON_E2E_DATA);
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["https://*/*", "http://*/*"] },
    (_details, callback) => callback({ cancel: true }),
  );
});
void import(
  pathToFileURL(path.resolve(__dirname, "../apps/desktop/out/main/index.js")).href
);
