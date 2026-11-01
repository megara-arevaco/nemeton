import type { LibrarySnapshot } from "@launcher/core";

export interface LocalFolderCandidate {
  id: string;
  title: string;
  directory: string;
  executables: string[];
  alreadyAdded: boolean;
}

export interface LocalFolderScan {
  scanId: string;
  directory: string;
  candidates: LocalFolderCandidate[];
  truncated: boolean;
  unreadableDirectories: number;
}

export interface LocalFolderSelection {
  candidateId: string;
  title: string;
  executablePath: string;
}

export interface LocalFolderImportResult {
  snapshot: LibrarySnapshot;
  addedCount: number;
  artworkMissingCount: number;
  skippedCount: number;
}
