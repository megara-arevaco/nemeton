import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { app, shell } from "electron";

const execFileAsync = promisify(execFile);
const powershellPath = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";

export function delay(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function toWindowsPath(input: string) {
  const match = /^\/mnt\/([a-z])\/(.*)$/i.exec(input);

  if (!match) {
    return input;
  }

  return `${match[1]!.toUpperCase()}:\\${match[2]!.replaceAll("/", "\\")}`;
}

export function toLocalPath(input: string) {
  const normalized = input.trim();
  const match = /^([a-z]):[\\/](.*)$/i.exec(normalized);

  if (!process.env.WSL_DISTRO_NAME || !match) {
    return normalized;
  }

  return `/mnt/${match[1]!.toLowerCase()}/${match[2]!.replaceAll("\\", "/")}`;
}

export function toLinuxPath(input: string) {
  return toLocalPath(input);
}

export async function openExternal(target: string) {
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
  if (process.env.WSL_DISTRO_NAME && executablePath.startsWith("/mnt/")) {
    const target = toWindowsPath(executablePath);
    const workingDirectory = toWindowsPath(path.dirname(executablePath));
    const script = `$process=Start-Process -FilePath ${quotePowerShell(target)} -WorkingDirectory ${quotePowerShell(workingDirectory)} -PassThru -ErrorAction Stop;$process.WaitForExit();exit $process.ExitCode`;

    return spawn(
      powershellPath,
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
