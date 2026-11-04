import { defaultSteamRoots } from "@launcher/core";
import { canonicalizeContext, findSteamUserdata } from "./savegames/destinations.js";
import { toWindowsPath, toLocalPath } from "../shared/system-paths.js";
import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { app, shell } from "electron";

export { toWindowsPath, toLocalPath, toLinuxPath } from "../shared/system-paths.js";
const execFileAsync = promisify(execFile);
const powershellPath = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";

export function delay(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function openExternal(target: string) {
  if (!/^steam:\/\/(rungameid|uninstall|install)\/\d+$/.test(target)) {
    throw new Error("Enlace de Steam no permitido");
  }
  if (!process.env.WSL_DISTRO_NAME) {
    await shell.openExternal(target);
    return;
  }

  const command = `Start-Process -FilePath ${quotePowerShell(target)}`;

  await execFileAsync(powershellPath, [
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
    encodePowerShellCommand(command),
  ]);
}

export function spawnLocalGame(executablePath: string) {
  if (
    process.platform === "win32" ||
    (process.env.WSL_DISTRO_NAME && executablePath.startsWith("/mnt/"))
  ) {
    const target = toWindowsPath(executablePath);
    const workingDirectory = toWindowsPath(path.dirname(executablePath));
    const script = `$process=Start-Process -FilePath ${quotePowerShell(target)} -WorkingDirectory ${quotePowerShell(workingDirectory)} -PassThru -ErrorAction Stop;$process.WaitForExit();exit $process.ExitCode`;
    const powershell = process.platform === "win32" ? "powershell.exe" : powershellPath;

    return spawn(
      powershell,
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        encodePowerShellCommand(script),
      ],
      { detached: false, stdio: "ignore" },
    );
  }

  return spawn(executablePath, [], {
    cwd: path.dirname(executablePath),
    detached: false,
    stdio: "ignore",
  });
}

export async function getRoamingAppData() {
  if (process.env.APPDATA) {
    return process.env.APPDATA;
  }

  if (!process.env.WSL_DISTRO_NAME) {
    return app.getPath("appData");
  }

  const { stdout } = await execFileAsync(powershellPath, [
    "-NoProfile",
    "-Command",
    "[Console]::Write($env:APPDATA)",
  ]);

  return toLocalPath(stdout);
}

export async function isInstalledGameRunning(installPath: string) {
  if (!installPath) {
    return false;
  }

  if (process.platform === "win32" || process.env.WSL_DISTRO_NAME) {
    const powershell = process.platform === "win32" ? "powershell.exe" : powershellPath;
    const prefix = toWindowsPath(installPath).replaceAll("'", "''");
    const script = `$p='${prefix}'; [Console]::Write(@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($p, [StringComparison]::OrdinalIgnoreCase) }).Count)`;
    const { stdout } = await execFileAsync(powershell, [
      "-NoProfile",
      "-Command",
      script,
    ]).catch(() => ({ stdout: "0" }));

    return Number(stdout.trim()) > 0;
  }

  const { stdout } = await execFileAsync("ps", ["-eo", "args="]).catch(() => ({
    stdout: "",
  }));

  return stdout.split("\n").some((command) => command.includes(installPath));
}

export function runBackground(task: Promise<unknown>, label: string) {
  task.catch((error) => {
    console.error(label, error);
  });
}

function encodePowerShellCommand(command: string) {
  return Buffer.from(command, "utf16le").toString("base64");
}

function quotePowerShell(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Resolve known folders locally, including the game's own Proton prefix. */
export async function getSavegamePathContext(game: {
  installPath: string;
  source: string;
  sourceId: string;
  steamAppId?: string | null;
}): Promise<import("./savegames/destinations.js").PathContext> {
  const fs = await import("node:fs/promises");
  const gameDirectory = game.installPath
    ? (await fs.stat(game.installPath).catch(() => null))?.isDirectory()
      ? game.installPath
      : path.dirname(game.installPath)
    : undefined;
  const steamAppId = game.source === "steam" ? game.sourceId : game.steamAppId;

  const steamUserdata = await findSteamUserdata(steamAppId, defaultSteamRoots());

  if (
    process.platform === "linux" &&
    gameDirectory &&
    steamAppId &&
    /^\d+$/.test(steamAppId)
  ) {
    let ancestor = path.resolve(gameDirectory);

    while (path.dirname(ancestor) !== ancestor) {
      if (path.basename(ancestor) === "steamapps") {
        const users = path.join(
          ancestor,
          "compatdata",
          steamAppId,
          "pfx",
          "drive_c",
          "users",
        );
        const profiles = (
          await fs.readdir(users, { withFileTypes: true }).catch(() => [])
        ).filter(
          (entry) =>
            entry.isDirectory() &&
            !/^(public|all users|default|default user)$/i.test(entry.name),
        );

        if (profiles.length === 1) {
          const profile = path.join(users, profiles[0]!.name);
          return canonicalizeContext({
            platform: "windows",
            anchors: {
              documents: path.join(profile, "Documents"),
              "saved-games": path.join(profile, "Saved Games"),
              roaming: path.join(profile, "AppData", "Roaming"),
              local: path.join(profile, "AppData", "Local"),
              "local-low": path.join(profile, "AppData", "LocalLow"),
              game: gameDirectory,
              ...(steamUserdata ? { "steam-userdata": steamUserdata } : {}),
            },
          });
        }
        break;
      }
      ancestor = path.dirname(ancestor);
    }
  }

  const windows = process.platform === "win32" || Boolean(process.env.WSL_DISTRO_NAME);
  const roaming = await getRoamingAppData();
  const profile = process.env.WSL_DISTRO_NAME
    ? path.dirname(path.dirname(roaming))
    : app.getPath("home");
  const documents = process.env.WSL_DISTRO_NAME
    ? path.join(profile, "Documents")
    : app.getPath("documents");
  // Electron falls back to HOME on Linux when the XDG Documents directory is absent.
  // HOME is not a portable Documents root: it can include other devices' fixture/install paths.
  const documentsRoot =
    path.resolve(documents) === path.resolve(profile)
      ? path.join(profile, "Documents")
      : documents;
  return canonicalizeContext({
    platform: windows ? "windows" : process.platform === "darwin" ? "darwin" : "linux",
    anchors: {
      documents: documentsRoot,
      "saved-games": path.join(profile, "Saved Games"),
      roaming,
      local: windows
        ? process.platform === "win32" && process.env.LOCALAPPDATA
          ? process.env.LOCALAPPDATA
          : path.join(path.dirname(roaming), "Local")
        : process.env.XDG_DATA_HOME || path.join(profile, ".local", "share"),
      ...(windows ? { "local-low": path.join(path.dirname(roaming), "LocalLow") } : {}),
      ...(gameDirectory ? { game: gameDirectory } : {}),
      ...(steamUserdata ? { "steam-userdata": steamUserdata } : {}),
    },
  });
}
