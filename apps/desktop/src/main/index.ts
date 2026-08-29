import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import { app, BrowserWindow, dialog, ipcMain, net, protocol, safeStorage, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { detectLocalSteamId, discoverGoldbergAchievements, discoverLocalSteamAppId, discoverSteamAchievements, discoverSteamGames, fetchOwnedSteamGames, LibraryStore, searchSteamArtwork } from "@launcher/core";
import type { GameAchievements, LibraryGame, LibrarySnapshot } from "@launcher/core";
import { SavegameManager } from "./savegames.js";
import { LudusaviCatalog } from "./ludusavi.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
let store: LibraryStore;
let coversDirectory: string;
let settingsPath: string;
let savegameManager: SavegameManager;
let ludusaviCatalog: LudusaviCatalog;
let achievementHistoryPath: string;
let sessionApiKey: string | null = null;
let activeFolderSync: Promise<{ snapshot: LibrarySnapshot; settings: { folderPath: string; lastSyncedAt: string } }> | null = null;
let lastSyncError: string | null = null;
const watchedSteamGames = new Set<string>();
const execFileAsync = promisify(execFile);

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const encodePowerShellCommand = (command: string) => Buffer.from(command, "utf16le").toString("base64");
const quotePowerShell = (value: string) => `'${value.replaceAll("'", "''")}'`;

const openExternal = async (target: string) => {
  if (process.env.WSL_DISTRO_NAME) {
    const powershell = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
    const command = `Start-Process -FilePath ${quotePowerShell(target)}`;
    await execFileAsync(powershell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodePowerShellCommand(command)]);
    return;
  }
  await shell.openExternal(target);
};

const spawnLocalGame = (executablePath: string) => {
  if (process.env.WSL_DISTRO_NAME && executablePath.startsWith("/mnt/")) {
    const powershell = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
    const target = toWindowsPath(executablePath);
    const workingDirectory = toWindowsPath(path.dirname(executablePath));
    const script = `$process=Start-Process -FilePath ${quotePowerShell(target)} -WorkingDirectory ${quotePowerShell(workingDirectory)} -PassThru -ErrorAction Stop;$process.WaitForExit();exit $process.ExitCode`;
    return spawn(powershell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodePowerShellCommand(script)], { detached: false, stdio: "ignore" });
  }
  return spawn(executablePath, [], { cwd: path.dirname(executablePath), detached: false, stdio: "ignore" });
};

const toWindowsPath = (input: string) => {
  const match = /^\/mnt\/([a-z])\/(.*)$/i.exec(input);
  return match ? `${match[1]!.toUpperCase()}:\\${match[2]!.replaceAll("/", "\\")}` : input;
};

const toLocalPath = (input: string) => {
  const match = /^([a-z]):[\\/](.*)$/i.exec(input.trim());
  return process.env.WSL_DISTRO_NAME && match
    ? `/mnt/${match[1]!.toLowerCase()}/${match[2]!.replaceAll("\\", "/")}`
    : input.trim();
};

const getRoamingAppData = async () => {
  if (process.env.APPDATA) return process.env.APPDATA;
  if (!process.env.WSL_DISTRO_NAME) return app.getPath("appData");
  const powershell = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
  const { stdout } = await execFileAsync(powershell, ["-NoProfile", "-Command", "[Console]::Write($env:APPDATA)"]);
  return toLocalPath(stdout);
};

interface AchievementHistoryEntry { gameSourceId: string; achievementId: string; name: string; detectedAt: string; unlockedAt: string | null; source: string | null }

const readAchievementHistory = async () => {
  const raw = await fs.promises.readFile(achievementHistoryPath, "utf8").catch(() => null);
  if (!raw) return [] as AchievementHistoryEntry[];
  try { return JSON.parse(raw) as AchievementHistoryEntry[]; } catch { return []; }
};

const writeAchievementHistory = async (entries: AchievementHistoryEntry[]) => {
  await fs.promises.writeFile(achievementHistoryPath, JSON.stringify(entries, null, 2));
};

const discoverAchievementsForGame = async (game: LibraryGame): Promise<GameAchievements> => {
  if (game.source === "steam") return discoverSteamAchievements(game.sourceId);
  const appId = game.steamAppId ?? await discoverLocalSteamAppId(game.installPath);
  if (!appId) return { total: 0, unlocked: 0, items: [], source: null, statePath: null, status: "missing-app-id" };
  return discoverGoldbergAchievements(appId, game.installPath, await getRoamingAppData());
};

const recordAchievementSnapshot = async (game: LibraryGame, result: GameAchievements) => {
  const history = await readAchievementHistory();
  const known = new Set(history.filter((entry) => entry.gameSourceId === game.sourceId).map((entry) => entry.achievementId));
  const newlyDetected = result.items.filter((item) => item.achieved && !known.has(item.id));
  if (!newlyDetected.length) return;
  const detectedAt = new Date().toISOString();
  history.push(...newlyDetected.map((item) => ({ gameSourceId: game.sourceId, achievementId: item.id, name: item.name, detectedAt, unlockedAt: item.unlockedAt, source: result.source ?? null })));
  await writeAchievementHistory(history);
};

const isInstalledGameRunning = async (installPath: string): Promise<boolean> => {
  if (!installPath) return false;
  if (process.platform === "win32" || process.env.WSL_DISTRO_NAME) {
    const powershell = process.platform === "win32"
      ? "powershell.exe"
      : "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
    const prefix = toWindowsPath(installPath).replaceAll("'", "''");
    const script = `$p='${prefix}'; [Console]::Write(@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($p, [StringComparison]::OrdinalIgnoreCase) }).Count)`;
    const { stdout } = await execFileAsync(powershell, ["-NoProfile", "-Command", script]).catch(() => ({ stdout: "0" }));
    return Number(stdout.trim()) > 0;
  }
  const { stdout } = await execFileAsync("ps", ["-eo", "args="]).catch(() => ({ stdout: "" }));
  return stdout.split("\n").some((command) => command.includes(installPath));
};

const watchSteamSession = async (gameId: string, installPath: string) => {
  if (!installPath || watchedSteamGames.has(gameId)) return;
  watchedSteamGames.add(gameId);
  let reportedRunning = false;
  try {
    let running = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await delay(3_000);
      running = await isInstalledGameRunning(installPath);
      if (running) break;
    }
    if (!running) return;
    reportedRunning = true;
    broadcastGameRunning(gameId, true);
    const startedAt = Date.now();
    while (await isInstalledGameRunning(installPath)) await delay(10_000);
    const durationSeconds = Math.round((Date.now() - startedAt) / 1_000);
    if (durationSeconds >= 10) {
      await store.addPlaytime(gameId, durationSeconds);
      await broadcastLibrary();
    }
  } finally {
    if (reportedRunning) broadcastGameRunning(gameId, false);
    watchedSteamGames.delete(gameId);
  }
};

interface StoredSettings { steamId: string | null; encryptedSteamApiKey: string | null; syncFolderPath?: string | null; lastSyncedAt?: string | null }

const runPowerShellWithInput = (script: string, input: string) => new Promise<string>((resolve, reject) => {
  const powershell = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
  const child = spawn(powershell, ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.once("error", reject);
  child.once("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr || `PowerShell terminó con código ${code}`)));
  child.stdin.end(input);
});

const protectWithWindows = async (value: string) => {
  const script = "$v=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($v);$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))";
  return `dpapi:${await runPowerShellWithInput(script, value)}`;
};

const unprotectWithWindows = async (value: string) => {
  const script = "$v=[Console]::In.ReadToEnd();$b=[Convert]::FromBase64String($v);$p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($p))";
  return runPowerShellWithInput(script, value);
};

const readSettings = async (): Promise<StoredSettings> => {
  const raw = await fs.promises.readFile(settingsPath, "utf8").catch(() => null);
  if (!raw) return { steamId: null, encryptedSteamApiKey: null, syncFolderPath: null, lastSyncedAt: null };
  try { return JSON.parse(raw) as StoredSettings; }
  catch { return { steamId: null, encryptedSteamApiKey: null, syncFolderPath: null, lastSyncedAt: null }; }
};

const writeSettings = async (settings: StoredSettings) => {
  await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2));
};

const readApiKey = async () => {
  if (sessionApiKey) return sessionApiKey;
  const settings = await readSettings();
  if (!settings.encryptedSteamApiKey) return null;
  try {
    if (settings.encryptedSteamApiKey.startsWith("dpapi:")) return unprotectWithWindows(settings.encryptedSteamApiKey.slice(6));
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(Buffer.from(settings.encryptedSteamApiKey, "base64"));
  }
  catch { return null; }
};

const writeSteamSettings = async (steamId: string, apiKey: string) => {
  sessionApiKey = apiKey;
  const encryptedSteamApiKey = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(apiKey).toString("base64")
    : process.env.WSL_DISTRO_NAME ? await protectWithWindows(apiKey) : null;
  await writeSettings({ ...(await readSettings()), steamId, encryptedSteamApiKey });
};

const toLinuxPath = (input: string) => {
  const normalized = input.trim();
  const match = /^([a-z]):[\\/](.*)$/i.exec(normalized);
  return process.env.WSL_DISTRO_NAME && match
    ? `/mnt/${match[1]!.toLowerCase()}/${match[2]!.replaceAll("\\", "/")}`
    : normalized;
};

const performFolderSync = async (folderPath: string) => {
  const resolved = path.resolve(toLinuxPath(folderPath));
  const directoryInfo = await fs.promises.stat(resolved).catch(() => null);
  if (!directoryInfo?.isDirectory()) throw new Error("La carpeta de sincronización no existe");
  const remotePath = path.join(resolved, "launcher-next-history.json");
  const raw = await fs.promises.readFile(remotePath, "utf8").catch(() => null);
  if (raw) {
    try { await store.mergeRemoteManual(JSON.parse(raw) as LibrarySnapshot); }
    catch { throw new Error("El historial remoto no tiene un formato válido"); }
  }
  const snapshot = await store.exportManualHistory();
  const temporary = `${remotePath}.tmp`;
  await fs.promises.writeFile(temporary, JSON.stringify(snapshot, null, 2));
  await fs.promises.rename(temporary, remotePath);
  const remoteAchievementsPath = path.join(resolved, "launcher-next-achievements.json");
  const localAchievements = await readAchievementHistory();
  const remoteAchievementsRaw = await fs.promises.readFile(remoteAchievementsPath, "utf8").catch(() => null);
  let remoteAchievements: AchievementHistoryEntry[] = [];
  try { remoteAchievements = remoteAchievementsRaw ? JSON.parse(remoteAchievementsRaw) as AchievementHistoryEntry[] : []; } catch { remoteAchievements = []; }
  const mergedAchievements = new Map<string, AchievementHistoryEntry>();
  for (const entry of [...localAchievements, ...remoteAchievements]) {
    const key = `${entry.gameSourceId}:${entry.achievementId}`;
    const previous = mergedAchievements.get(key);
    if (!previous || entry.detectedAt < previous.detectedAt) mergedAchievements.set(key, entry);
  }
  const achievementEntries = [...mergedAchievements.values()];
  await writeAchievementHistory(achievementEntries);
  const achievementsTemporary = `${remoteAchievementsPath}.tmp`;
  await fs.promises.writeFile(achievementsTemporary, JSON.stringify(achievementEntries, null, 2));
  await fs.promises.rename(achievementsTemporary, remoteAchievementsPath);
  const lastSyncedAt = new Date().toISOString();
  await writeSettings({ ...(await readSettings()), syncFolderPath: resolved, lastSyncedAt });
  lastSyncError = null;
  return { snapshot: await store.read(), settings: { folderPath: resolved, lastSyncedAt } };
};

const syncFolder = (folderPath: string) => {
  if (activeFolderSync) return activeFolderSync;
  activeFolderSync = performFolderSync(folderPath).catch((error) => { lastSyncError = error instanceof Error ? error.message : String(error); throw error; }).finally(() => { activeFolderSync = null; });
  return activeFolderSync;
};

protocol.registerSchemesAsPrivileged([
  { scheme: "launcher-cover", privileges: { secure: true, supportFetchAPI: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  const existingWindow = BrowserWindow.getAllWindows()[0];
  if (!existingWindow) return;
  if (existingWindow.isMinimized()) existingWindow.restore();
  existingWindow.show();
  existingWindow.focus();
});

const broadcastLibrary = async () => {
  const snapshot = await store.read();
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("library:changed", snapshot);
  }
};

const broadcastGameRunning = (gameId: string, running: boolean) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("game:running-changed", { gameId, running });
  }
};

const autoSync = async () => {
  const settings = await readSettings();
  if (!settings.syncFolderPath) return;
  await syncFolder(settings.syncFolderPath);
  await broadcastLibrary();
};

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#090a0f",
    icon: path.join(directory, "../../resources/icon.png"),
    frame: false,
    webPreferences: {
      preload: path.join(directory, "../preload/index.mjs"),
      contextIsolation: true,
      sandbox: false,
    },
  });

  window.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error("[renderer:load]", { code, description, url });
  });
  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("[preload:error]", { preloadPath, error });
  });
  window.on("focus", () => { void autoSync().catch((error) => console.error("[sync:auto]", error)); });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(path.join(directory, "../renderer/index.html"));
  }
};

app.whenReady().then(() => {
  store = new LibraryStore(path.join(app.getPath("userData"), "library.json"));
  coversDirectory = path.join(app.getPath("userData"), "covers");
  settingsPath = path.join(app.getPath("userData"), "settings.json");
  savegameManager = new SavegameManager(path.join(app.getPath("userData"), "savegames.json"));
  ludusaviCatalog = new LudusaviCatalog(path.join(app.getPath("userData"), "ludusavi-catalog.json"), async (url) => {
    const response = await net.fetch(url);
    if (!response.ok) throw new Error(`Ludusavi respondió ${response.status}`);
    return response.text();
  });
  achievementHistoryPath = path.join(app.getPath("userData"), "achievements-history.json");
  protocol.handle("launcher-cover", async (request) => {
    const fileName = path.basename(decodeURIComponent(new URL(request.url).pathname));
    return net.fetch(`file://${path.join(coversDirectory, fileName)}`);
  });

  ipcMain.handle("library:list", () => store.read());
  ipcMain.handle("window:minimize", (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.handle("window:toggle-maximize", (event) => {
    const target = BrowserWindow.fromWebContents(event.sender);
    if (target?.isMaximized()) target.unmaximize(); else target?.maximize();
  });
  ipcMain.handle("window:close", (event) => BrowserWindow.fromWebContents(event.sender)?.close());
  ipcMain.handle("artwork:search", (_event, query: string) => searchSteamArtwork(query));
  ipcMain.handle("ludusavi:search", (_event, query: string) => ludusaviCatalog.search(query));
  ipcMain.handle("ludusavi:auto-associate", async () => {
    let snapshot = await store.read();
    let count = 0;
    for (const game of snapshot.games.filter((item) => item.source === "local" && !item.ludusaviGameName)) {
      const match = await ludusaviCatalog.match(game.title, game.steamAppId);
      if (!match) continue;
      snapshot = await store.updateLocalGame(game.id, { title: game.title, executablePath: game.installPath, playtimeMinutes: game.trackedPlaytimeSeconds / 60, steamAppId: game.steamAppId ?? match.steamAppId, ludusaviGameName: match.name });
      count += 1;
    }
    return { snapshot, count };
  });
  ipcMain.handle("library:set-remote-artwork", async (_event, gameId: string, artwork: { coverUrl: string; heroUrl: string; steamAppId?: string | null }) => {
    const snapshot = await store.setRemoteArtwork(gameId, artwork);
    void autoSync().catch((error) => console.error("[sync:auto]", error));
    return snapshot;
  });
  ipcMain.handle("steam:settings", async () => {
    const settings = await readSettings();
    const steamId = settings.steamId ?? await detectLocalSteamId();
    return { steamId, hasApiKey: Boolean(await readApiKey()) };
  });
  ipcMain.handle("sync:settings", async () => {
    const settings = await readSettings();
    const exists = settings.syncFolderPath ? Boolean((await fs.promises.stat(settings.syncFolderPath).catch(() => null))?.isDirectory()) : false;
    return { folderPath: settings.syncFolderPath ?? null, lastSyncedAt: settings.lastSyncedAt ?? null, status: !settings.syncFolderPath ? "unconfigured" : activeFolderSync ? "syncing" : lastSyncError ? "error" : exists ? "ready" : "missing", error: lastSyncError };
  });
  ipcMain.handle("sync:select-folder", async () => {
    const settings = await readSettings();
    const result = await dialog.showOpenDialog({ title: "Selecciona la carpeta de sincronización", defaultPath: settings.syncFolderPath ?? undefined, properties: ["openDirectory", "createDirectory"] });
    const folderPath = result.filePaths[0];
    if (result.canceled || !folderPath) return null;
    return syncFolder(folderPath);
  });
  ipcMain.handle("sync:now", async () => {
    const settings = await readSettings();
    if (!settings.syncFolderPath) throw new Error("Selecciona primero una carpeta de sincronización");
    return syncFolder(settings.syncFolderPath);
  });
  ipcMain.handle("savegames:get", async (_event, gameId: string) => {
    const game = (await store.read()).games.find((item) => item.id === gameId && item.source === "local");
    if (!game) throw new Error("Las partidas sincronizadas solo están disponibles para juegos manuales");
    const settings = await readSettings();
    let paths = await savegameManager.removeInstallRoot(gameId, game.installPath);
    const ludusavi = game.ludusaviGameName ? await ludusaviCatalog.find(game.ludusaviGameName) : null;
    const policy = await savegameManager.getPolicy(gameId);
    const suggestions = await savegameManager.suggestPaths(game.title, await getRoamingAppData(), game.installPath, game.steamAppId, ludusavi, policy.includeConfig);
    for (const suggestion of suggestions.filter((item) => item.confidence === "high" && !paths.includes(item.path))) paths = await savegameManager.addPath(gameId, suggestion.path);
    const versions = settings.syncFolderPath ? await savegameManager.listVersions(settings.syncFolderPath, game.sourceId) : [];
    const missingPaths = (await Promise.all(paths.map(async (folderPath) => ({ folderPath, exists: Boolean((await fs.promises.stat(folderPath).catch(() => null))?.isDirectory()) })))).filter((item) => !item.exists).map((item) => item.folderPath);
    const synchronized = settings.syncFolderPath && paths.length && !missingPaths.length && versions.length ? await savegameManager.currentMatchesLatest(gameId, game.sourceId, settings.syncFolderPath) : false;
    const syncState = !settings.syncFolderPath ? "unconfigured" : missingPaths.length ? "path-missing" : !paths.length ? "not-detected" : !versions.length ? "waiting-backup" : synchronized ? "synced" : "pending";
    return { paths, suggestions: suggestions.filter((item) => !paths.includes(item.path)), versions, policy, syncConfigured: Boolean(settings.syncFolderPath), syncState, missingPaths };
  });
  ipcMain.handle("savegames:set-policy", (_event, gameId: string, policy: Parameters<SavegameManager["setPolicy"]>[1]) => savegameManager.setPolicy(gameId, policy));
  ipcMain.handle("savegames:add-folder", async (_event, gameId: string) => {
    const result = await dialog.showOpenDialog({ title: "Selecciona la carpeta de partidas guardadas", properties: ["openDirectory", "createDirectory"] });
    const folderPath = result.filePaths[0];
    if (result.canceled || !folderPath) return null;
    return savegameManager.addPath(gameId, toLinuxPath(folderPath));
  });
  ipcMain.handle("savegames:add-suggested", (_event, gameId: string, folderPath: string) => savegameManager.addPath(gameId, folderPath));
  ipcMain.handle("savegames:remove-folder", (_event, gameId: string, folderPath: string) => savegameManager.removePath(gameId, folderPath));
  ipcMain.handle("savegames:backup", async (_event, gameId: string) => {
    const game = (await store.read()).games.find((item) => item.id === gameId && item.source === "local");
    const settings = await readSettings();
    if (!game) throw new Error("No se encontró el juego manual");
    if (!settings.syncFolderPath) throw new Error("Selecciona primero la carpeta de sincronización en Ajustes");
    await savegameManager.backup(game.id, game.sourceId, settings.syncFolderPath);
    return savegameManager.listVersions(settings.syncFolderPath, game.sourceId);
  });
  ipcMain.handle("savegames:set-pinned", async (_event, gameId: string, versionId: string, pinned: boolean) => {
    const game = (await store.read()).games.find((item) => item.id === gameId && item.source === "local");
    const settings = await readSettings();
    if (!game || !settings.syncFolderPath) throw new Error("No se puede modificar esta copia");
    return savegameManager.setPinned(settings.syncFolderPath, game.sourceId, versionId, pinned);
  });
  ipcMain.handle("savegames:restore", async (event, gameId: string, versionId: string) => {
    const game = (await store.read()).games.find((item) => item.id === gameId && item.source === "local");
    const settings = await readSettings();
    if (!game || !settings.syncFolderPath) throw new Error("No se puede restaurar esta copia");
    const version = (await savegameManager.listVersions(settings.syncFolderPath, game.sourceId)).find((item) => item.id === versionId);
    const policy = await savegameManager.getPolicy(gameId);
    const details = version ? `${version.fileCount} archivos · ${Math.round(version.sizeBytes / 1024)} KB · creada ${new Date(version.createdAt).toLocaleString("es-ES")}.` : "";
    const response = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender)!, { type: "warning", buttons: ["Cancelar", "Restaurar"], defaultId: 0, cancelId: 0, title: "Restaurar partidas", message: `¿Restaurar esta versión de ${game.title}?`, detail: `${details}\nAntes se copiará el estado presente.${policy.exactRestore ? " La restauración exacta también eliminará archivos que no estén en esta versión." : " Los archivos adicionales se conservarán."}` });
    if (response.response !== 1) return null;
    await savegameManager.backup(game.id, game.sourceId, settings.syncFolderPath);
    return savegameManager.restore(game.id, game.sourceId, settings.syncFolderPath, versionId);
  });
  ipcMain.handle("steam:connect", async (_event, apiKey: string, requestedSteamId?: string) => {
    const steamId = requestedSteamId?.trim() || await detectLocalSteamId();
    if (!steamId) throw new Error("No se pudo detectar el SteamID64");
    const ownedGames = await fetchOwnedSteamGames(apiKey, steamId);
    await writeSteamSettings(steamId, apiKey.trim());
    await store.importSteamAccount(ownedGames);
    const installedGames = await discoverSteamGames();
    const snapshot = await store.importSteam(installedGames);
    return { settings: { steamId, hasApiKey: true }, snapshot, ownedCount: ownedGames.length };
  });
  ipcMain.handle("steam:refresh-account", async () => {
    const settings = await readSettings();
    const apiKey = await readApiKey();
    if (!settings.steamId || !apiKey) throw new Error("Configura primero tu cuenta de Steam");
    const ownedGames = await fetchOwnedSteamGames(apiKey, settings.steamId);
    await store.importSteamAccount(ownedGames);
    const snapshot = await store.importSteam(await discoverSteamGames());
    return { snapshot, ownedCount: ownedGames.length };
  });
  ipcMain.handle("library:achievements", async (_event, gameId: string) => {
    const game = (await store.read()).games.find((item) => item.id === gameId);
    if (!game) return { total: 0, unlocked: 0, items: [] };
    const result = await discoverAchievementsForGame(game);
    await recordAchievementSnapshot(game, result);
    return result;
  });
  ipcMain.handle("library:scan-steam", async () => {
    const candidates = await discoverSteamGames();
    return store.importSteam(candidates);
  });
  ipcMain.handle("dialog:select-executable", async () => {
    const result = await dialog.showOpenDialog({
      title: "Selecciona el ejecutable del juego",
      properties: ["openFile"],
      filters: process.platform === "win32"
        ? [{ name: "Ejecutables", extensions: ["exe", "bat", "cmd"] }]
        : [],
    });
    const executablePath = result.filePaths[0];
    if (result.canceled || !executablePath) return null;
    return {
      path: executablePath,
      suggestedTitle: path.basename(executablePath, path.extname(executablePath)),
    };
  });
  ipcMain.handle("dialog:select-artwork", async () => {
    const result = await dialog.showOpenDialog({
      title: "Selecciona una carátula",
      properties: ["openFile"],
      filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    const artworkPath = result.filePaths[0];
    if (result.canceled || !artworkPath) return null;
    const stats = await fs.promises.stat(artworkPath).catch(() => null);
    if (!stats?.isFile() || stats.size > 10 * 1024 * 1024) {
      throw new Error("La carátula debe pesar menos de 10 MB");
    }
    const extension = path.extname(artworkPath).toLowerCase();
    const mime = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
    const bytes = await fs.promises.readFile(artworkPath);
    return { path: artworkPath, name: path.basename(artworkPath), previewUrl: `data:${mime};base64,${bytes.toString("base64")}` };
  });
  ipcMain.handle("library:add-local", async (_event, input: { title: string; executablePath: string; artworkPath?: string | null; coverUrl?: string | null; heroUrl?: string | null; steamAppId?: string | null; ludusaviGameName?: string | null }) => {
    const title = input.title.trim();
    const executablePath = input.executablePath ? path.resolve(input.executablePath) : "";
    const executable = executablePath
      ? await fs.promises.stat(executablePath).catch(() => null)
      : null;
    if (!title) throw new Error("Escribe un nombre para el juego");
    if (executablePath && !executable?.isFile()) throw new Error("El ejecutable seleccionado no existe");
    let snapshot = await store.addLocal({ title, executablePath, coverUrl: input.coverUrl, heroUrl: input.heroUrl, steamAppId: input.steamAppId, ludusaviGameName: input.ludusaviGameName });
    const game = [...snapshot.games].reverse().find((item) =>
      item.source === "local" && (executablePath ? item.installPath && path.resolve(item.installPath) === executablePath : item.title === title));
    if (game && input.artworkPath) {
      const extension = path.extname(input.artworkPath).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) throw new Error("Formato de carátula no compatible");
      await fs.promises.mkdir(coversDirectory, { recursive: true });
      const fileName = `${game.id}${extension}`;
      await fs.promises.copyFile(input.artworkPath, path.join(coversDirectory, fileName));
      snapshot = await store.setCover(game.id, fileName);
    }
    void autoSync().catch((error) => console.error("[sync:auto]", error));
    return snapshot;
  });
  ipcMain.handle("library:update-local", async (_event, gameId: string, input: { title: string; executablePath: string; playtimeMinutes: number; steamAppId?: string | null; ludusaviGameName?: string | null }) => {
    if (input.steamAppId && !/^\d+$/.test(input.steamAppId.trim())) throw new Error("El Steam AppID debe contener solo números");
    if (!input.title.trim()) throw new Error("Escribe un nombre para el juego");
    if (input.executablePath) {
      const executable = await fs.promises.stat(input.executablePath).catch(() => null);
      if (!executable?.isFile()) throw new Error("El ejecutable seleccionado no existe");
    }
    const snapshot = await store.updateLocalGame(gameId, input);
    void autoSync().catch((error) => console.error("[sync:auto]", error));
    return snapshot;
  });
  ipcMain.handle("library:set-cover", async (_event, gameId: string) => {
    const result = await dialog.showOpenDialog({
      title: "Selecciona una carátula",
      properties: ["openFile"],
      filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    const source = result.filePaths[0];
    if (result.canceled || !source) return null;
    await fs.promises.mkdir(coversDirectory, { recursive: true });
    const fileName = `${gameId}${path.extname(source).toLowerCase()}`;
    await fs.promises.copyFile(source, path.join(coversDirectory, fileName));
    const snapshot = await store.setCover(gameId, fileName);
    void autoSync().catch((error) => console.error("[sync:auto]", error));
    return snapshot;
  });
  ipcMain.handle("library:uninstall-or-hide", async (_event, gameId: string) => {
    const game = (await store.read()).games.find((item) => item.id === gameId);
    if (!game) throw new Error("No se encontró el juego");
    if (game.source === "steam" && game.installed) await openExternal(`steam://uninstall/${game.sourceId}`);
    const snapshot = await store.hideFromLibrary(gameId);
    void autoSync().catch((error) => console.error("[sync:auto]", error));
    return snapshot;
  });
  ipcMain.handle("library:launch", async (_event, gameId: string) => {
    const game = (await store.read()).games.find((item) => item.id === gameId);
    if (!game) throw new Error("Game not found");
    if (game.source === "steam" && game.launchUri) {
      await openExternal(game.launchUri);
      if (game.installed) void watchSteamSession(game.id, game.installPath);
      return;
    }
    if (!game.installPath) throw new Error("Este juego todavía no tiene ejecutable");
    const savePolicy = await savegameManager.getPolicy(game.id);
    const launchSettings = await readSettings();
    if (savePolicy.backupBeforeLaunch && launchSettings.syncFolderPath) await savegameManager.backup(game.id, game.sourceId, launchSettings.syncFolderPath);
    const roamingAppData = await getRoamingAppData();
    const activityBefore = await savegameManager.captureActivity(roamingAppData);
    await recordAchievementSnapshot(game, await discoverAchievementsForGame(game)).catch((error) => console.error("[achievements:initial]", error));
    const startedAt = Date.now();
    const child = spawnLocalGame(game.installPath);
    let pollingAchievements = false;
    const achievementTimer = setInterval(() => {
      if (pollingAchievements) return;
      pollingAchievements = true;
      void discoverAchievementsForGame(game).then((result) => recordAchievementSnapshot(game, result)).catch((error) => console.error("[achievements:watch]", error)).finally(() => { pollingAchievements = false; });
    }, 5_000);
    let reportedRunning = false;
    child.once("spawn", () => {
      reportedRunning = true;
      broadcastGameRunning(game.id, true);
    });
    child.once("error", (error) => {
      clearInterval(achievementTimer);
      if (reportedRunning) broadcastGameRunning(game.id, false);
      console.error("[launch:local]", error);
    });
    child.once("close", async () => {
      clearInterval(achievementTimer);
      await discoverAchievementsForGame(game).then((result) => recordAchievementSnapshot(game, result)).catch((error) => console.error("[achievements:final]", error));
      if (reportedRunning) broadcastGameRunning(game.id, false);
      const syncSettings = await readSettings();
      await savegameManager.learnActivity(game.title, activityBefore, roamingAppData).catch((error) => console.error("[savegames:learn]", error));
      if (savePolicy.autoBackup && syncSettings.syncFolderPath) await savegameManager.backup(game.id, game.sourceId, syncSettings.syncFolderPath).catch((error) => console.error("[savegames:auto]", error));
      const durationSeconds = Math.round((Date.now() - startedAt) / 1_000);
      if (durationSeconds < 5) return;
      await store.addPlaytime(game.id, durationSeconds);
      await broadcastLibrary();
      await autoSync().catch((error) => console.error("[sync:auto]", error));
    });
  });

  createWindow();
  setTimeout(() => { void autoSync().catch((error) => console.error("[sync:auto]", error)); }, 1_500);
  setInterval(() => { void autoSync().catch((error) => console.error("[sync:auto]", error)); }, 30_000);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
