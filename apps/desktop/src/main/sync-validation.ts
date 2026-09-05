import { z } from "zod";

const text = z.string().max(4096);

const id = z
  .string()
  .min(1)
  .max(240)
  .regex(/^[a-zA-Z0-9_-]+$/);

const nonnegative = z.number().finite().nonnegative();

const imageUrl = text
  .url()
  .refine((value) => new URL(value).protocol === "https:")
  .nullable();

export const remoteLibrarySchema = z.object({
  version: z.literal(1),
  games: z
    .array(
      z.object({
        id,
        source: z.enum(["local", "steam"]),
        sourceId: id,
        title: text.min(1),
        installPath: text,
        launchUri: text.nullable(),
        coverPath: text.nullable(),
        coverUrl: imageUrl,
        heroUrl: imageUrl,
        steamAppId: z
          .string()
          .regex(/^\d{1,12}$/)
          .nullable()
          .optional(),
        achievementStateId: id.nullable().optional(),
        ludusaviGameName: text.nullable().optional(),
        playtimeMinutes: nonnegative,
        playtimeSecondsRemainder: nonnegative,
        platformPlaytimeMinutes: nonnegative.nullable(),
        trackedPlaytimeSeconds: nonnegative,
        installed: z.boolean(),
        hiddenFromLibrary: z.boolean().optional(),
        lastPlayedAt: text.nullable(),
        importedAt: text,
        updatedAt: text.optional(),
      }),
    )
    .max(100_000),
  sessions: z
    .array(
      z.object({
        id,
        gameId: id,
        startedAt: text,
        endedAt: text,
        durationSeconds: nonnegative,
        origin: z.enum(["launcher", "steam-sync"]).optional(),
      }),
    )
    .max(1_000_000),
  excludedGameKeys: z.array(text).max(100_000).optional(),
});

export const achievementHistorySchema = z
  .array(
    z.object({
      gameSourceId: id,
      achievementId: text,
      name: text,
      detectedAt: text,
      unlockedAt: text.nullable(),
      source: text.nullable(),
    }),
  )
  .max(1_000_000);
