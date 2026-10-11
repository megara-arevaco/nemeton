import {
  discoverSteamGames,
  fetchOwnedSteamGames,
  fetchSteamStoreArtwork,
  isUnresolvedSteamArtwork,
  type LibrarySnapshot,
  type SteamCandidate,
  type SteamOwnedGame,
} from "@launcher/core";
import type { LibraryStore } from "@launcher/core";
import type { SettingsStore } from "./settings.js";

type Store = Pick<
  LibraryStore,
  "importSteamSnapshot" | "importSteam" | "resolveSteamArtwork"
>;

type Settings = Pick<SettingsStore, "read" | "readApiKey">;

export class SteamSyncService {
  private readonly artworkRetryAt = new Map<string, number>();
  private accountFailures = 0;
  private retryAccountAt = 0;
  private automaticRefresh: Promise<void> | null = null;

  constructor(
    private readonly store: Store,
    private readonly settings: Settings,
    private readonly broadcastLibrary: (snapshot: LibrarySnapshot) => Promise<void>,
    private readonly fetchOwned: (
      apiKey: string,
      steamId: string,
    ) => Promise<SteamOwnedGame[]> = fetchOwnedSteamGames,
    private readonly discoverInstalled: () => Promise<
      SteamCandidate[]
    > = discoverSteamGames,
  ) {}

  async refreshWithCredentials(apiKey: string, steamId: string) {
    const [ownedGames, installedGames] = await Promise.all([
      this.fetchOwned(apiKey, steamId),
      this.discoverInstalled(),
    ]);
    const snapshot = await this.resolveArtwork(
      await this.store.importSteamSnapshot(ownedGames, installedGames),
    );
    await this.broadcastLibrary(snapshot);
    return { snapshot, ownedCount: ownedGames.length };
  }

  async refreshAccount() {
    const settings = await this.settings.read();
    const apiKey = await this.settings.readApiKey();

    if (!settings.steamId || !apiKey) {
      throw new Error("Configura primero tu cuenta de Steam");
    }
    return this.refreshWithCredentials(apiKey, settings.steamId);
  }

  async scanLocal(): Promise<LibrarySnapshot> {
    const snapshot = await this.resolveArtwork(
      await this.store.importSteam(await this.discoverInstalled()),
    );
    await this.broadcastLibrary(snapshot);
    return snapshot;
  }

  private async resolveArtwork(snapshot: LibrarySnapshot): Promise<LibrarySnapshot> {
    const pending = snapshot.games.filter(
      (game) =>
        game.source === "steam" &&
        !game.coverPath &&
        (isUnresolvedSteamArtwork(game.coverUrl) ||
          isUnresolvedSteamArtwork(game.heroUrl)) &&
        Date.now() >= (this.artworkRetryAt.get(game.sourceId) ?? 0),
    );
    const artwork = new Map<
      string,
      Awaited<ReturnType<typeof fetchSteamStoreArtwork>>
    >();
    // Bound requests, and retry unavailable assets later rather than on every scan.
    await Promise.all(
      Array.from({ length: Math.min(4, pending.length) }, async () => {
        for (;;) {
          const game = pending.shift();

          if (!game) {
            return;
          }
          this.artworkRetryAt.set(game.sourceId, Date.now() + 30 * 60_000);
          try {
            const resolved = await fetchSteamStoreArtwork(game.sourceId);

            if (!isUnresolvedSteamArtwork(resolved.coverUrl)) {
              artwork.set(game.sourceId, resolved);
            }
          } catch {
            // Artwork availability must not prevent playtime/install synchronization.
          }
        }
      }),
    );
    return artwork.size ? this.store.resolveSteamArtwork(artwork) : snapshot;
  }

  refreshAutomatically(): Promise<void> {
    if (this.automaticRefresh) {
      return this.automaticRefresh;
    }

    const refresh = this.runAutomaticRefresh().finally(() => {
      this.automaticRefresh = null;
    });
    this.automaticRefresh = refresh;
    return refresh;
  }

  private async runAutomaticRefresh() {
    const settings = await this.settings.read();
    const apiKey = settings.steamId ? await this.settings.readApiKey() : null;

    if (settings.steamId && apiKey && Date.now() >= this.retryAccountAt) {
      try {
        await this.refreshWithCredentials(apiKey, settings.steamId);
        this.accountFailures = 0;
        this.retryAccountAt = 0;
        return;
      } catch (error) {
        this.accountFailures++;
        this.retryAccountAt =
          Date.now() +
          Math.min(30 * 60_000, 5 * 60_000 * 2 ** (this.accountFailures - 1));
        console.warn("[steam:auto-account]", error);
      }
    }
    await this.scanLocal();
  }
}
