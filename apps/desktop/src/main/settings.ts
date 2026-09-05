import { readTextIfExists, withFileLock, writeJsonAtomically } from "@launcher/core";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { safeStorage } from "electron";
export interface StoredSettings {
  steamId: string | null;
  encryptedSteamApiKey: string | null;
  syncFolderPath?: string | null;
  lastSyncedAt?: string | null;
}

const emptySettings: StoredSettings = {
  steamId: null,
  encryptedSteamApiKey: null,
  syncFolderPath: null,
  lastSyncedAt: null,
};

export class SettingsStore {
  private sessionApiKey: string | null = null;

  constructor(private readonly filePath: string) {}

  async read(): Promise<StoredSettings> {
    const raw = await readTextIfExists(this.filePath);

    if (!raw) {
      return emptySettings;
    }

    try {
      return JSON.parse(raw) as StoredSettings;
    } catch {
      throw new Error("El archivo de ajustes está dañado");
    }
  }

  async write(settings: StoredSettings) {
    await writeJsonAtomically(this.filePath, settings);
  }

  async update(patch: Partial<StoredSettings>) {
    return withFileLock(this.filePath, async () =>
      this.write({ ...(await this.read()), ...patch }),
    );
  }

  async readApiKey() {
    if (this.sessionApiKey) {
      return this.sessionApiKey;
    }

    const settings = await this.read();

    if (!settings.encryptedSteamApiKey) {
      return null;
    }

    try {
      if (settings.encryptedSteamApiKey.startsWith("dpapi:")) {
        return unprotectWithWindows(settings.encryptedSteamApiKey.slice(6));
      }

      if (!safeStorage.isEncryptionAvailable()) {
        return null;
      }

      return safeStorage.decryptString(
        Buffer.from(settings.encryptedSteamApiKey, "base64"),
      );
    } catch {
      return null;
    }
  }

  async writeSteamCredentials(steamId: string, apiKey: string) {
    return withFileLock(this.filePath, async () => {
      this.sessionApiKey = apiKey;

      const encryptedSteamApiKey = safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(apiKey).toString("base64")
        : process.env.WSL_DISTRO_NAME
          ? await protectWithWindows(apiKey)
          : null;

      await this.write({
        ...(await this.read()),
        steamId,
        encryptedSteamApiKey,
      });
    });
  }
}

function runPowerShellWithInput(script: string, input: string) {
  return new Promise<string>((resolve, reject) => {
    const powershell = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
    const child = spawn(
      powershell,
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(new Error(stderr || `PowerShell terminó con código ${code}`));
    });

    child.stdin.end(input);
  });
}

async function protectWithWindows(value: string) {
  const script =
    "$v=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($v);$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))";

  return `dpapi:${await runPowerShellWithInput(script, value)}`;
}

function unprotectWithWindows(value: string) {
  const script =
    "$v=[Console]::In.ReadToEnd();$b=[Convert]::FromBase64String($v);$p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($p))";

  return runPowerShellWithInput(script, value);
}
