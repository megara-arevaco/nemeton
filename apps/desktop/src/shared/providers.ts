export type StoreProvider = "epic" | "gog";

export type ProviderOperation = "install" | "update" | "verify";

export interface ProviderState {
  provider: StoreProvider;
  helperPath: string | null;
  connected: boolean;
  persistentCredentials: boolean;
  username: string | null;
  lastSyncedAt: string | null;
  error: string | null;
  operation: {
    gameId: string;
    action: ProviderOperation | "launch";
    progress: number | null;
  } | null;
}
