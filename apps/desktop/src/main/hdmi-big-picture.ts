import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { app, powerMonitor, screen } from "electron";
import type { BrowserWindow } from "electron";
import path from "node:path";

const run = promisify(execFile);

// WMI reports the active display path. Some TVs keep that path active in standby.
const queryHdmi = [
  "$ErrorActionPreference = 'Stop'",
  "$links = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorConnectionParams",
  "@($links | Where-Object { $_.Active -and $_.VideoOutputTechnology -eq 5 } | ForEach-Object { $_.InstanceName }) | Sort-Object",
].join("; ");

export function watchHdmiBigPicture(window: BrowserWindow, open: () => void) {
  if (process.platform !== "win32" || process.env.NEMETON_E2E_DATA) {
    return;
  }

  const powershell = path.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32/WindowsPowerShell/v1.0/powershell.exe",
  );
  let active = new Set<string>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();

  const poll = async () => {
    timer = undefined;
    try {
      const { stdout } = await run(
        powershell,
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", queryHdmi],
        { windowsHide: true, timeout: 4500, signal: controller.signal },
      );

      if (stopped) {
        return;
      }

      const next = new Set(
        stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      );
      const connected = [...next].some((display) => !active.has(display));
      active = next;
      if (connected) {
        open();
      }
    } catch {
      // Keep the last successful observation across transient driver errors.
    } finally {
      if (!stopped) {
        timer = setTimeout(() => void poll(), 5000);
      }
    }
  };

  const onDisplayChange = () => {
    if (timer) {
      clearTimeout(timer);
      void poll();
    }
  };
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    controller.abort();
    screen.off("display-added", onDisplayChange);
    screen.off("display-removed", onDisplayChange);
    powerMonitor.off("resume", onDisplayChange);
    app.off("before-quit", stop);
  };
  screen.on("display-added", onDisplayChange);
  screen.on("display-removed", onDisplayChange);
  powerMonitor.on("resume", onDisplayChange);
  app.once("before-quit", stop);
  window.once("closed", stop);
  void poll();
}
