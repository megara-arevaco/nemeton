import { discoverStoreInstallations } from "./provider-discovery.js";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { safeStorage } from "electron";
import {
  readTextIfExists,
  writeJsonAtomically,
  type LibraryGame,
  type LibraryStore,
  type LibrarySnapshot,
} from "@launcher/core";
import type {
  ProviderState,
  StoreProvider,
  ProviderOperation,
} from "../shared/providers.js";

interface Configuration {
  helperPath: string | null;
  encryptedCredentials: string | null;
  username: string | null;
  lastSyncedAt: string | null;
}

interface Product {
  playtimeMinutes?: number;
  id: string;
  title: string;
  installPath: string;
  coverUrl: string | null;
  platform?: string;
}

const empty = (): Configuration => ({
  helperPath: null,
  encryptedCredentials: null,
  username: null,
  lastSyncedAt: null,
});

const providerName = (provider: StoreProvider) =>
  provider === "epic" ? "legendary" : "gogdl";

const safeId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,240}$/.test(value);

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const secure = () =>
  safeStorage.isEncryptionAvailable() &&
  (process.platform !== "linux" ||
    safeStorage.getSelectedStorageBackend() !== "basic_text");

/** Local adapters. Credentials never cross IPC and helper processes never use a shell. */
export class ProviderService {
  private configs: Record<StoreProvider, Configuration> = {
    epic: empty(),
    gog: empty(),
  };
  private credentials = new Map<StoreProvider, string>();
  private operations = new Map<StoreProvider, ProviderState["operation"]>();
  private errors = new Map<StoreProvider, string>();
  private locks = new Map<StoreProvider, Promise<unknown>>();
  private playtimeChecked = new Map<string, number>();
  private stopping = false;
  private shutdown = new AbortController();
  private cancelled = new Set<StoreProvider>();
  private processes = new Map<ReturnType<typeof spawn>, StoreProvider>();
  constructor(
    private readonly directory: string,
    private readonly store: LibraryStore,
    private readonly broadcast: (snapshot: LibrarySnapshot) => Promise<void>,
  ) {}
  async initialize() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const raw = await readTextIfExists(path.join(this.directory, "providers.json"));

    if (raw) {
      const parsed = object(JSON.parse(raw));

      for (const provider of ["epic", "gog"] as const) {
        this.configs[provider] = {
          ...empty(),
          ...object(parsed[provider]),
        } as Configuration;
      }
    }
    for (const provider of ["epic", "gog"] as const) {
      const config = this.configs[provider];

      if (config.encryptedCredentials && secure()) {
        try {
          this.credentials.set(
            provider,
            safeStorage.decryptString(
              Buffer.from(config.encryptedCredentials, "base64"),
            ),
          );
        } catch {
          this.errors.set(provider, "credentials-unavailable");
        }
      }
      if (!config.helperPath) {
        config.helperPath = await this.findHelper(provider);
      }

      // Recover and seal a credential file left by an interrupted helper operation.
      const credentialPath = this.credentialFile(provider);
      const leftover = await readTextIfExists(credentialPath);

      if (leftover) {
        this.credentials.set(provider, leftover);
        await fs.unlink(credentialPath);
      }
    }
    await this.save();
  }
  private async save() {
    for (const provider of ["epic", "gog"] as const) {
      const raw = this.credentials.get(provider);
      this.configs[provider].encryptedCredentials =
        raw && secure() ? safeStorage.encryptString(raw).toString("base64") : null;
    }
    await writeJsonAtomically(
      path.join(this.directory, "providers.json"),
      this.configs,
    );
  }
  states(): ProviderState[] {
    return (["epic", "gog"] as const).map((provider) => ({
      provider,
      helperPath: this.configs[provider].helperPath,
      connected: this.credentials.has(provider),
      persistentCredentials: Boolean(this.configs[provider].encryptedCredentials),
      username: this.configs[provider].username,
      lastSyncedAt: this.configs[provider].lastSyncedAt,
      error: this.errors.get(provider) ?? null,
      operation: this.operations.get(provider) ?? null,
    }));
  }
  private async findHelper(provider: StoreProvider) {
    const name = providerName(provider) + (process.platform === "win32" ? ".exe" : "");

    for (const directory of [
      path.join(this.directory, "bin"),
      ...(process.env.PATH ?? "").split(path.delimiter),
    ]) {
      const candidate = path.join(directory, name);

      if (
        await fs
          .stat(candidate)
          .then((stat) => stat.isFile())
          .catch(() => false)
      ) {
        return candidate;
      }
    }
    return null;
  }
  async configure(provider: StoreProvider, helperPath: string) {
    const resolved = await fs.realpath(helperPath);

    if (!(await fs.stat(resolved)).isFile()) {
      throw new Error("invalid-helper");
    }
    this.configs[provider].helperPath = resolved;
    await this.save();
    return this.states();
  }
  private credentialFile(provider: StoreProvider) {
    return path.join(
      this.directory,
      provider,
      provider === "epic" ? "user.json" : "auth.json",
    );
  }
  private exclusive<T>(provider: StoreProvider, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(provider) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(action);
    this.locks.set(provider, next);
    void next
      .finally(() => {
        if (this.locks.get(provider) === next) {
          this.locks.delete(provider);
        }
      })
      .catch(() => undefined);
    return next;
  }
  private async command(
    provider: StoreProvider,
    args: string[],
    onOutput?: (line: string) => void,
  ): Promise<string> {
    if (this.stopping) {
      throw new Error("provider-stopping");
    }

    const helper = this.configs[provider].helperPath;

    if (!helper) {
      throw new Error("helper-required");
    }

    const configDirectory = path.join(this.directory, provider);
    await fs.mkdir(configDirectory, { recursive: true, mode: 0o700 });
    const credentialPath = this.credentialFile(provider);
    const saved = this.credentials.get(provider);

    if (saved) {
      await fs.writeFile(credentialPath, saved, { mode: 0o600 });
    }
    try {
      const prefix =
        provider === "gog" ? ["--auth-config-path", credentialPath] : ["-y"];
      return await new Promise<string>((resolve, reject) => {
        if (this.stopping || this.cancelled.has(provider)) {
          reject(new Error("provider-stopping"));
          return;
        }

        const child = spawn(helper, [...prefix, ...args], {
          env: {
            ...process.env,
            LEGENDARY_CONFIG_PATH: configDirectory,
            GOGDL_CONFIG_PATH: configDirectory,
          },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
        this.processes.set(child, provider);
        let output = "";
        let overflow = false;
        const timer = setTimeout(
          () => child.kill(),
          onOutput ? 24 * 60 * 60_000 : 120_000,
        );
        child.stdout.on("data", (chunk: Buffer) => {
          if (!overflow && output.length + chunk.length <= 32 * 1024 * 1024) {
            output += chunk.toString();
          } else {
            overflow = true;
            child.kill();
          }
          onOutput?.(chunk.toString());
        });
        child.stderr.on("data", (chunk: Buffer) => onOutput?.(chunk.toString()));
        child.once("error", () => {
          clearTimeout(timer);
          this.processes.delete(child);
          reject(new Error("helper-failed"));
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          this.processes.delete(child);
          if (code !== 0 || overflow) {
            reject(new Error("helper-failed"));
          } else {
            resolve(output);
          }
        });
      });
    } finally {
      const updated = await readTextIfExists(credentialPath);

      if (updated) {
        this.credentials.set(provider, updated);
      }
      try {
        await this.save();
      } finally {
        await fs.unlink(credentialPath).catch(() => undefined);
      }
    }
  }
  async connect(provider: StoreProvider, authorizationCode: string) {
    return this.exclusive(provider, async () => {
      let code = authorizationCode.trim();

      if (code.startsWith("{")) {
        code = String(object(JSON.parse(code)).authorizationCode ?? "");
      }
      if (code.startsWith("https://")) {
        code = new URL(code).searchParams.get("code") ?? "";
      }
      if (!/^[a-zA-Z0-9_.-]{8,4096}$/.test(code)) {
        throw new Error("invalid-auth-code");
      }

      const previous = this.credentials.get(provider);
      this.credentials.delete(provider);
      this.playtimeChecked.clear();
      try {
        await this.command(provider, ["auth", "--code", code]);
        if (!this.credentials.has(provider)) {
          throw new Error("authentication-failed");
        }
        if (provider === "epic") {
          const credentials = object(JSON.parse(this.credentials.get(provider)!));
          this.configs.epic.username = String(
            credentials.displayName ?? credentials.account_id ?? "Epic Games",
          );
        }
        this.errors.delete(provider);
        await this.refreshUnlocked(provider);
      } catch (error) {
        if (previous) {
          this.credentials.set(provider, previous);
        } else {
          this.credentials.delete(provider);
        }
        await this.save();
        throw error;
      }
      await this.save();
      return this.states();
    });
  }
  async disconnect(provider: StoreProvider) {
    if (this.operations.has(provider)) {
      throw new Error("provider-busy");
    }
    return this.exclusive(provider, async () => {
      this.credentials.delete(provider);
      this.configs[provider].username = null;
      this.errors.delete(provider);
      await fs.unlink(this.credentialFile(provider)).catch(() => undefined);
      await this.save();
      return this.states();
    });
  }
  async refresh(provider: StoreProvider) {
    return this.exclusive(provider, () => this.refreshUnlocked(provider));
  }
  private async refreshUnlocked(provider: StoreProvider) {
    if (!this.credentials.has(provider)) {
      throw new Error("connect-provider");
    }

    let products: Product[] = [];

    if (provider === "epic") {
      const listed: unknown = JSON.parse(
        await this.command(provider, ["list-games", "--json"]),
      );
      const installed: unknown = JSON.parse(
        await this.command(provider, ["list-installed", "--json"]),
      );

      if (!Array.isArray(listed) || !Array.isArray(installed)) {
        throw new Error("invalid-provider-response");
      }

      const installs = new Map(
        installed.map((item) => {
          const record = object(item);
          return [String(record.app_name), record];
        }),
      );
      const discovered = await discoverStoreInstallations("epic");
      const ownedIds = new Set(listed.map((item) => String(object(item).app_name)));

      for (const [id, directory] of discovered) {
        if (!ownedIds.has(id) || installs.has(id)) {
          continue;
        }
        try {
          await this.command("epic", [
            "import-game",
            id,
            directory,
            "--disable-check",
            "--skip-dlcs",
          ]);
          installs.set(id, { app_name: id, install_path: directory });
        } catch {
          /* Keep the account entry available when a manifest cannot be adopted. */
        }
      }
      products = listed.flatMap((item) => {
        const record = object(item);

        if (!safeId(record.app_name) || typeof record.app_title !== "string") {
          return [];
        }

        const metadata = object(record.metadata);
        const images = Array.isArray(metadata.keyImages)
          ? metadata.keyImages.map(object)
          : [];
        const image =
          images.find((entry) => entry.type === "DieselGameBoxTall") ?? images[0];
        const installed = installs.get(record.app_name);
        return [
          {
            id: record.app_name,
            title: record.app_title,
            installPath:
              typeof installed?.install_path === "string" ? installed.install_path : "",
            coverUrl:
              typeof image?.url === "string" && image.url.startsWith("https://")
                ? image.url
                : null,
          },
        ];
      });
      const credentials = object(JSON.parse(this.credentials.get("epic") ?? "{}"));

      if (
        typeof credentials.access_token === "string" &&
        typeof credentials.account_id === "string"
      ) {
        try {
          const response = await fetch(
            `https://library-service.live.use1a.on.epicgames.com/library/api/public/playtime/account/${encodeURIComponent(credentials.account_id)}/all`,
            {
              headers: { Authorization: `Bearer ${credentials.access_token}` },
              signal: AbortSignal.any([
                this.shutdown.signal,
                AbortSignal.timeout(20_000),
              ]),
            },
          );

          if (response.ok) {
            const values: unknown = await response.json();

            if (Array.isArray(values)) {
              const times = new Map(
                values
                  .map(object)
                  .filter(
                    (item) =>
                      safeId(item.artifactId) &&
                      typeof item.totalTime === "number" &&
                      Number.isFinite(item.totalTime) &&
                      item.totalTime >= 0,
                  )
                  .map((item) => [
                    String(item.artifactId),
                    Math.floor(Number(item.totalTime) / 60),
                  ]),
              );
              products = products.map((product) => ({
                ...product,
                playtimeMinutes: times.get(product.id),
              }));
            }
          }
        } catch {
          /* Library import remains usable when historical playtime is unavailable. */
        }
      }
    } else {
      const auth = object(JSON.parse(await this.command(provider, ["auth"])));

      if (typeof auth.access_token !== "string") {
        throw new Error("authentication-failed");
      }

      const profile = object(
        await this.gogJson("https://embed.gog.com/userData.json", auth.access_token),
      );
      this.configs.gog.username =
        typeof profile.username === "string" ? profile.username : "GOG";
      for (let page = 1; page <= 1000; page++) {
        const data = object(
          await this.gogJson(
            `https://embed.gog.com/account/getFilteredProducts?mediaType=1&page=${page}`,
            auth.access_token,
          ),
        );

        if (!Array.isArray(data.products)) {
          throw new Error("invalid-provider-response");
        }
        for (const value of data.products) {
          const item = object(value);
          const id = String(item.id);

          if (!safeId(id) || typeof item.title !== "string") {
            continue;
          }

          const image = typeof item.image === "string" ? item.image : null;
          products.push({
            id,
            title: item.title,
            installPath: "",
            coverUrl: image?.startsWith("//")
              ? `https:${image}`
              : image?.startsWith("https://")
                ? image
                : null,
          });
        }
        if (page >= Number(data.totalPages ?? 1)) {
          break;
        }
      }

      const current = await this.store.read();
      const discovered = await discoverStoreInstallations("gog");
      products = products.map((product) => ({
        ...product,
        installPath:
          discovered.get(product.id) ??
          current.games.find(
            (game) => game.source === "gog" && game.sourceId === product.id,
          )?.installPath ??
          "",
      }));
    }

    products = await Promise.all(
      products.map(async (product) => ({
        ...product,
        installPath:
          product.installPath &&
          (await fs.stat(product.installPath).catch(() => null))?.isDirectory()
            ? product.installPath
            : "",
      })),
    );
    const snapshot = await this.store.importProviderGames(provider, products);
    this.configs[provider].lastSyncedAt = new Date().toISOString();
    this.errors.delete(provider);
    await this.save();
    await this.broadcast(snapshot);
    return snapshot;
  }
  private async gogJson(url: string, token: string): Promise<unknown> {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.any([this.shutdown.signal, AbortSignal.timeout(20_000)]),
    });

    if (!response.ok) {
      throw new Error(`provider-http-${response.status}`);
    }
    if (Number(response.headers.get("content-length")) > 32 * 1024 * 1024) {
      throw new Error("invalid-provider-response");
    }
    return response.json();
  }
  async operate(
    game: LibraryGame,
    action: ProviderOperation,
    directory: string | null,
  ) {
    const provider = game.source;

    if (provider !== "epic" && provider !== "gog") {
      throw new Error("invalid-provider");
    }
    if (this.operations.has(provider)) {
      throw new Error("provider-busy");
    }
    if (!this.credentials.has(provider)) {
      throw new Error("connect-provider");
    }
    if (!this.configs[provider].helperPath) {
      throw new Error("helper-required");
    }

    const destination = action === "install" ? directory : game.installPath;

    if (!destination) {
      throw new Error("choose-folder");
    }

    const target =
      provider === "gog" && action === "install"
        ? path.join(destination, game.sourceId)
        : destination;
    const operation: NonNullable<ProviderState["operation"]> = {
      gameId: game.id,
      action,
      progress: null,
    };
    this.operations.set(provider, operation);
    this.errors.delete(provider);
    const args =
      provider === "epic"
        ? action === "verify"
          ? ["verify", game.sourceId]
          : [
              "install",
              game.sourceId,
              ...(action === "install" ? ["--base-path", destination] : []),
            ]
        : [
            action === "verify"
              ? "repair"
              : action === "install"
                ? "download"
                : "update",
            game.sourceId,
            "--path",
            target,
            "--platform",
            process.platform === "win32"
              ? "windows"
              : process.platform === "darwin"
                ? "osx"
                : "linux",
          ];
    void this.exclusive(provider, async () => {
      try {
        await this.command(provider, args, (text) => {
          const match = /(\d+(?:\.\d+)?)\s*%/.exec(text);

          if (match) {
            operation.progress = Math.max(0, Math.min(100, Number(match[1])));
          }
        });
        if (provider === "gog") {
          await this.store.setProviderInstall(game.id, target);
        }
        await this.refreshUnlocked(provider);
      } catch {
        this.errors.set(
          provider,
          this.cancelled.has(provider) ? "operation-cancelled" : "operation-failed",
        );
      } finally {
        this.operations.delete(provider);
        this.cancelled.delete(provider);
      }
    });
    return this.states();
  }
  async refreshPlaytime(game: LibraryGame) {
    if (
      game.source !== "gog" ||
      !this.credentials.has("gog") ||
      this.operations.has("gog")
    ) {
      return null;
    }
    if (Date.now() - (this.playtimeChecked.get(game.id) ?? 0) < 5 * 60_000) {
      return null;
    }
    return this.exclusive("gog", async () => {
      this.playtimeChecked.set(game.id, Date.now());
      try {
        const auth = object(JSON.parse(await this.command("gog", ["auth"])));

        if (typeof auth.access_token !== "string" || typeof auth.user_id !== "string") {
          return null;
        }

        const data = object(
          await this.gogJson(
            `https://gameplay.gog.com/games/${encodeURIComponent(game.sourceId)}/users/${encodeURIComponent(auth.user_id)}/sessions`,
            auth.access_token,
          ),
        );

        if (
          typeof data.time_sum !== "number" ||
          !Number.isFinite(data.time_sum) ||
          data.time_sum < 0 ||
          data.time_sum > 100_000_000
        ) {
          return null;
        }

        const snapshot = await this.store.importProviderGames("gog", [
          {
            id: game.sourceId,
            title: game.title,
            installPath: game.installPath,
            coverUrl: game.coverUrl,
            playtimeMinutes: Math.floor(data.time_sum),
          },
        ]);
        await this.broadcast(snapshot);
        return snapshot;
      } catch {
        return null;
      }
    });
  }
  async importInstalled(game: LibraryGame, directory: string) {
    const resolved = await fs.realpath(directory);

    if (!(await fs.stat(resolved)).isDirectory()) {
      throw new Error("invalid-installation");
    }
    if (game.source === "epic") {
      await this.exclusive("epic", () =>
        this.command("epic", ["import-game", game.sourceId, resolved]),
      );
      return this.refresh("epic");
    }
    if (game.source !== "gog") {
      throw new Error("invalid-provider");
    }

    const data = object(
      JSON.parse(
        await fs.readFile(path.join(resolved, `goggame-${game.sourceId}.info`), "utf8"),
      ),
    );

    if (
      String(data.gameId) !== game.sourceId &&
      String(data.rootGameId) !== game.sourceId
    ) {
      throw new Error("invalid-installation");
    }
    return this.store.setProviderInstall(game.id, resolved);
  }
  async launch(game: LibraryGame) {
    const provider = game.source;

    if (provider !== "epic" && provider !== "gog") {
      throw new Error("invalid-provider");
    }
    if (!game.installed || !game.installPath) {
      throw new Error("not-installed");
    }
    if (!this.configs[provider].helperPath) {
      throw new Error("helper-required");
    }
    if (this.operations.has(provider)) {
      throw new Error("provider-busy");
    }

    const args =
      provider === "epic"
        ? ["launch", game.sourceId]
        : [
            "launch",
            game.installPath,
            game.sourceId,
            "--platform",
            process.platform === "win32"
              ? "windows"
              : process.platform === "darwin"
                ? "osx"
                : "linux",
          ];
    this.operations.set(provider, {
      gameId: game.id,
      action: "launch",
      progress: null,
    });
    void this.exclusive(provider, async () => {
      try {
        await this.command(provider, args, () => undefined);
      } catch {
        this.errors.set(provider, "launch-failed");
      } finally {
        this.operations.delete(provider);
      }
    });
  }
  cancel(provider: StoreProvider) {
    const operation = this.operations.get(provider);

    if (!operation || operation.action === "launch") {
      throw new Error("no-transfer-to-cancel");
    }
    this.cancelled.add(provider);
    for (const [child, source] of this.processes) {
      if (source === provider) {
        child.kill();
      }
    }
    return this.states();
  }
  async stop() {
    this.stopping = true;
    this.shutdown.abort();
    const forceTimers = [...this.processes.keys()].map((child) => {
      child.kill();
      const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
      timer.unref();
      return timer;
    });
    await Promise.allSettled([...this.locks.values()]);
    for (const timer of forceTimers) {
      clearTimeout(timer);
    }
    for (const provider of ["epic", "gog"] as const) {
      const file = this.credentialFile(provider);
      const raw = await readTextIfExists(file);

      if (raw) {
        this.credentials.set(provider, raw);
      }
      try {
        await this.save();
      } finally {
        await fs.unlink(file).catch(() => undefined);
      }
    }
  }
}
