import { z } from "zod";

export const downloadUrlSchema = z
  .string()
  .max(8192)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  });

export const downloadUriSchema = z
  .string()
  .max(8192)
  .refine((value) => {
    if (downloadUrlSchema.safeParse(value).success) {
      return true;
    }
    try {
      const url = new URL(value);
      return (
        url.protocol === "magnet:" &&
        url.searchParams
          .getAll("xt")
          .some((xt) => /^urn:btih:([a-f\d]{40}|[a-z2-7]{32})$/i.test(xt))
      );
    } catch {
      return false;
    }
  });

export type DownloadMethod = "real-debrid" | "torrent";

export type DownloadStatus =
  | "queued"
  | "preparing"
  | "waiting-selection"
  | "downloading"
  | "paused"
  | "completed"
  | "cancelled"
  | "interrupted"
  | "error";

export type DownloadAction = "pause" | "resume" | "cancel" | "retry" | "remove";

export type DownloadFileAction = "pause" | "resume" | "cancel";

export interface DownloadFile {
  id: string;
  name: string;
  total: number;
  bytes: number;
  speed: number;
  progress: number;
  selected: boolean;
  status: DownloadStatus;
  error: string | null;
  restarted?: boolean;
}

export interface DownloadJob {
  id: string;
  title: string;
  uri: string;
  torrentFileId?: string;
  method: DownloadMethod;
  status: DownloadStatus;
  directory: string;
  bytes: number;
  total: number;
  speed: number;
  progress: number;
  cloudProgress: number;
  peers: number;
  error: string | null;
  createdAt: string;
  torrentId?: string;
  files: DownloadFile[];
  selectionConfirmed: boolean;
}

export interface DownloadsSnapshot {
  jobs: DownloadJob[];
  directory: string | null;
  account: { username: string; expiration: string } | null;
  hasToken: boolean;
  persistentToken: boolean;
  maxConcurrent: number;
}

export const startDownloadSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    uri: downloadUriSchema.optional(),
    torrentFileId: z.string().uuid().optional(),
    method: z.enum(["real-debrid", "torrent"]),
  })
  .refine((input) => Boolean(input.uri) !== Boolean(input.torrentFileId));

export type StartDownloadInput = z.infer<typeof startDownloadSchema>;
