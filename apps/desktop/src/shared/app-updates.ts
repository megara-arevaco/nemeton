export type AppUpdateStatus =
  | "unsupported"
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "downloading"
  | "downloaded"
  | "error";

export interface AppUpdateState {
  status: AppUpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  progress: number;
  error: string | null;
  reason: "development" | "portable" | "platform" | null;
}
