import fs from "node:fs/promises";
import path from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { app, type BrowserWindow } from "electron";

export function startPerformanceLog() {
  const started = performance.now();
  const filePath = path.join(app.getPath("userData"), "performance.log");
  let writes = Promise.resolve();
  const log = (event: string, details: Record<string, unknown> = {}) => {
    const line = JSON.stringify({
      time: new Date().toISOString(),
      event,
      elapsedMs: Math.round(performance.now() - started),
      ...details,
    });
    writes = writes
      .then(async () => {
        if (((await fs.stat(filePath).catch(() => null))?.size ?? 0) > 1024 * 1024) {
          await fs.rename(filePath, `${filePath}.previous`);
        }
        await fs.appendFile(filePath, `${line}\n`, { mode: 0o600 });
      })
      .catch((error) => console.warn("[performance:log]", error));
  };
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const sample = () => {
    log("resources", {
      eventLoopMaxMs: Math.round(delay.max / 1e6),
      eventLoopP99Ms: Math.round(delay.percentile(99) / 1e6),
      processes: app.getAppMetrics().map((process) => ({
        type: process.type,
        cpuPercent: process.cpu.percentCPUUsage,
        workingSetKiB: process.memory.workingSetSize,
      })),
    });
    delay.reset();
  };
  const timer = setInterval(sample, 60_000);
  timer.unref();
  const startupTimer = setTimeout(sample, 5_000);
  startupTimer.unref();
  app.once("before-quit", () => {
    clearInterval(timer);
    clearTimeout(startupTimer);
    delay.disable();
  });
  log("ready");
  return (window: BrowserWindow) => {
    log("window-created");
    window.webContents.once("dom-ready", () => log("dom-ready"));
    window.webContents.once("did-finish-load", () => log("renderer-loaded"));
    window.on("unresponsive", () => log("window-unresponsive"));
    window.webContents.on("render-process-gone", (_event, details) =>
      log("renderer-gone", { reason: details.reason, exitCode: details.exitCode }),
    );
  };
}
