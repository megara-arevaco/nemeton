export interface SavegameVersion {
  id: string;
  createdAt: string;
  deviceId: string;
  deviceName: string;
  sizeBytes: number;
  fileCount: number;
  pinned?: boolean;
}

export interface SavegameConflict {
  remoteVersion: SavegameVersion;
}

export interface SavegameSuggestion {
  path: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface SavegamePolicy {
  autoBackup: boolean;
  backupBeforeLaunch: boolean;
  maxVersions: number;
  maxSizeMb: number;
  excludedNames: string[];
  exactRestore: boolean;
  includeConfig: boolean;
}

export interface SavegameState {
  paths: string[];
  suggestions: SavegameSuggestion[];
  versions: SavegameVersion[];
  policy: SavegamePolicy;
  syncConfigured: boolean;
  syncState:
    | "unconfigured"
    | "path-missing"
    | "not-detected"
    | "waiting-backup"
    | "synced"
    | "conflict"
    | "pending";
  missingPaths: string[];
  conflict: SavegameVersion | null;
}
