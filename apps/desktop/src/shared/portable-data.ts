import { z } from "zod";

import { isValidSteamAppId } from "@launcher/core";

import { savegamePolicySchema } from "./ipc-contracts.js";

const rawText = z.string().max(4096);
const safeText = rawText.refine((value) => !value.includes("\0"));

const portableId = z
  .string()
  .min(1)
  .max(240)
  .regex(/^[a-zA-Z0-9_-]+$/);

const sourceId = portableId;

const dateText = z
  .string()
  .max(64)
  .refine((value) => Number.isFinite(Date.parse(value)));

const nullableDate = dateText.nullable();

const imageUrl = z
  .string()
  .max(4096)
  .url()
  .refine((value) => new URL(value).protocol === "https:")
  .nullable();

const game = z
  .object({
    id: portableId,
    source: z.enum(["steam", "local"]),
    sourceId,
    steamAppId: z.string().refine(isValidSteamAppId).nullable().optional(),
    achievementStateId: safeText.nullable().optional(),
    ludusaviGameName: safeText.nullable().optional(),
    title: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine((value) => !value.includes("\0")),
    coverUrl: imageUrl,
    heroUrl: imageUrl,
    playtimeMinutes: z.number().int().min(0).max(100_000_000),
    playtimeSecondsRemainder: z.number().int().min(0).max(59),
    platformPlaytimeMinutes: z.number().int().min(0).nullable(),
    trackedPlaytimeSeconds: z.number().int().min(0).max(6_000_000_000),
    hiddenFromLibrary: z.boolean().optional(),
    favorite: z.boolean().optional(),
    backlogStatus: z.enum(["pending", "playing", "finished"]).nullable().optional(),
    lastPlayedAt: nullableDate,
    importedAt: dateText,
    updatedAt: dateText.optional(),
  })
  .strict();

export const portableDataSchema = z
  .object({
    format: z.literal("nemeton-portable-data"),
    version: z.literal(1),
    exportedAt: dateText,
    preferences: z
      .object({
        language: z.enum(["es", "en"]),
        accentTheme: z.enum(["forest", "aurora", "ember", "amethyst", "glacier"]),
      })
      .strict(),
    library: z
      .object({
        version: z.literal(1),
        games: z.array(game).max(50_000),
        sessions: z
          .array(
            z
              .object({
                id: portableId,
                gameId: portableId,
                startedAt: dateText,
                endedAt: dateText,
                durationSeconds: z.number().int().min(0).max(31_536_000),
                origin: z.enum(["launcher", "steam-sync"]).optional(),
              })
              .strict(),
          )
          .max(2_000_000),
        excludedGameKeys: z
          .array(
            z
              .string()
              .max(260)
              .regex(/^(?:steam:[1-9]\d{0,11}|local:[a-zA-Z0-9_-]{1,240})$/),
          )
          .max(50_000)
          .optional(),
      })
      .strict(),
    achievementHistory: z
      .array(
        z
          .object({
            gameSourceId: sourceId,
            achievementId: z
              .string()
              .min(1)
              .max(4096)
              .refine((value) => !value.includes("\0")),
            name: safeText,
            detectedAt: dateText,
            unlockedAt: nullableDate,
            source: safeText.nullable(),
          })
          .strict(),
      )
      .max(2_000_000),
    savegamePolicies: z.record(z.string().max(2048), savegamePolicySchema).default({}),
  })
  .strict()
  .superRefine((data, context) => {
    const ids = new Set<string>();
    const keys = new Set<string>();
    const sessionIds = new Set<string>();
    const excludedKeys = new Set<string>();

    for (const [index, item] of data.library.games.entries()) {
      if (ids.has(item.id)) {
        context.addIssue({
          code: "custom",
          path: ["library", "games", index, "id"],
          message: "Duplicate game id",
        });
      }
      ids.add(item.id);
      const key = `${item.source}:${item.sourceId}`;

      if (item.source === "steam") {
        if (!isValidSteamAppId(item.sourceId)) {
          context.addIssue({
            code: "custom",
            path: ["library", "games", index, "sourceId"],
            message: "Steam sourceId must be a numeric AppID",
          });
        } else if (item.steamAppId != null && item.steamAppId !== item.sourceId) {
          context.addIssue({
            code: "custom",
            path: ["library", "games", index, "steamAppId"],
            message: "Steam sourceId and steamAppId must match",
          });
        }
      }

      if (keys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["library", "games", index, "sourceId"],
          message: "Duplicate game source",
        });
      }
      keys.add(key);
    }
    for (const [index, session] of data.library.sessions.entries()) {
      if (!ids.has(session.gameId)) {
        context.addIssue({
          code: "custom",
          path: ["library", "sessions", index, "gameId"],
          message: "Session references an unknown game",
        });
      }
      if (sessionIds.has(session.id)) {
        context.addIssue({
          code: "custom",
          path: ["library", "sessions", index, "id"],
          message: "Duplicate session id",
        });
      }
      sessionIds.add(session.id);
    }

    for (const [index, key] of (data.library.excludedGameKeys ?? []).entries()) {
      if (excludedKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["library", "excludedGameKeys", index],
          message: "Duplicate excluded game key",
        });
      }
      excludedKeys.add(key);
    }

    const gameKeys = new Set(
      data.library.games.map((item) => `${item.source}:${item.sourceId}`),
    );

    for (const key of Object.keys(data.savegamePolicies)) {
      if (!key.startsWith("local:") || !gameKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["savegamePolicies", key],
          message: "Policy references an unknown local game",
        });
      }
    }
  });

const portableAssetSchema = z
  .object({
    path: z.string().regex(/^assets\/covers\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/i),
    source: z.enum(["steam", "local"]),
    sourceId,
    extension: z.enum([".png", ".jpg", ".jpeg", ".webp"]),
    size: z
      .number()
      .int()
      .min(1)
      .max(10 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const portableBackupSchema = z
  .object({
    path: z.string().regex(/^backups\/[a-zA-Z0-9_-]+\.zip$/),
    gameKey: z
      .string()
      .max(260)
      .regex(/^local:[a-zA-Z0-9_-]{1,240}$/),
    versionId: z
      .string()
      .min(1)
      .max(240)
      .regex(/^[a-zA-Z0-9_-]+$/),
    size: z
      .number()
      .int()
      .min(1)
      .max(40 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const portablePackageSchema = z
  .object({
    format: z.literal("nemeton-portable-package"),
    version: z.literal(1),
    exportedAt: dateText,
    data: portableDataSchema,
    assets: z.array(portableAssetSchema).max(50_000),
    backups: z.array(portableBackupSchema).max(50_000),
  })
  .strict()
  .superRefine((packageData, context) => {
    const gameKeys = new Set(
      packageData.data.library.games.map((item) => `${item.source}:${item.sourceId}`),
    );
    const paths = new Set<string>();
    const assetGameKeys = new Set<string>();
    const backupKeys = new Set<string>();

    for (const [index, asset] of packageData.assets.entries()) {
      const key = `${asset.source}:${asset.sourceId}`;

      if (!gameKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["assets", index],
          message: "Asset references an unknown game",
        });
      }
      if (assetGameKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["assets", index, "sourceId"],
          message: "Duplicate asset for game",
        });
      }
      assetGameKeys.add(key);
      if (paths.has(asset.path)) {
        context.addIssue({
          code: "custom",
          path: ["assets", index, "path"],
          message: "Duplicate asset path",
        });
      }
      paths.add(asset.path);
      if (pathExtension(asset.path) !== asset.extension) {
        context.addIssue({
          code: "custom",
          path: ["assets", index, "extension"],
          message: "Asset extension mismatch",
        });
      }
    }
    for (const [index, backup] of packageData.backups.entries()) {
      if (!gameKeys.has(backup.gameKey)) {
        context.addIssue({
          code: "custom",
          path: ["backups", index, "gameKey"],
          message: "Backup references an unknown game",
        });
      }

      const backupKey = `${backup.gameKey}:${backup.versionId}`;

      if (backupKeys.has(backupKey)) {
        context.addIssue({
          code: "custom",
          path: ["backups", index, "versionId"],
          message: "Duplicate backup version",
        });
      }
      backupKeys.add(backupKey);
      if (paths.has(backup.path)) {
        context.addIssue({
          code: "custom",
          path: ["backups", index, "path"],
          message: "Duplicate package path",
        });
      }
      paths.add(backup.path);
    }
  });

function pathExtension(value: string): string {
  const name = value.slice(value.lastIndexOf("/") + 1);
  return name.slice(name.lastIndexOf("."));
}

export type PortableData = z.infer<typeof portableDataSchema>;

export type PortablePackage = z.infer<typeof portablePackageSchema>;

export type PortableAsset = z.infer<typeof portablePackageSchema>["assets"][number];

export type PortableBackup = z.infer<typeof portablePackageSchema>["backups"][number];
