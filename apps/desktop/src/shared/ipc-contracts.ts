import { z } from "zod";

const id = z
  .string()
  .min(1)
  .max(240)
  .regex(/^[a-zA-Z0-9_-]+$/);

const text = z
  .string()
  .max(4096)
  .refine((value) => !value.includes("\0"));

const title = text.trim().min(1).max(500);

const appId = z
  .string()
  .regex(/^\d{1,12}$/)
  .nullable()
  .optional();

const imageUrl = z
  .string()
  .max(4096)
  .url()
  .refine((value) => new URL(value).protocol === "https:");

const localGame = z.object({
  title,
  executablePath: text,
  steamAppId: appId,
  ludusaviGameName: title.nullable().optional(),
});

export const savegamePolicySchema = z.object({
  autoBackup: z.boolean(),
  backupBeforeLaunch: z.boolean(),
  maxVersions: z.number().int().min(1).max(100),
  maxSizeMb: z.number().int().min(1).max(10240),
  excludedNames: z.array(z.string().max(255)).max(100),
  exactRestore: z.boolean(),
  includeConfig: z.boolean(),
});

export const ipcContracts = {
  "window:minimize": z.tuple([]),
  "window:toggle-maximize": z.tuple([]),
  "window:close": z.tuple([]),
  "workspace:status": z.tuple([]),
  "library:list": z.tuple([]),
  "library:metadata": z.tuple([id]),
  "library:achievements": z.tuple([id]),
  "steam:settings": z.tuple([]),
  "steam:refresh-account": z.tuple([]),
  "steam:connect": z.tuple([
    z
      .string()
      .trim()
      .regex(/^[a-f0-9]{32}$/i),
    z
      .string()
      .trim()
      .regex(/^7656119\d{10}$/)
      .or(z.literal(""))
      .optional(),
  ]),
  "library:scan-steam": z.tuple([]),
  "sync:settings": z.tuple([]),
  "sync:select-folder": z.tuple([]),
  "sync:now": z.tuple([]),
  "savegames:get": z.tuple([id]),
  "savegames:set-policy": z.tuple([id, savegamePolicySchema.partial().strict()]),
  "savegames:add-folder": z.tuple([id]),
  "savegames:add-suggested": z.tuple([id, text.min(1)]),
  "savegames:remove-folder": z.tuple([id, text.min(1)]),
  "savegames:backup": z.tuple([id]),
  "savegames:set-pinned": z.tuple([id, id, z.boolean()]),
  "savegames:restore": z.tuple([id, id]),
  "dialog:select-executable": z.tuple([]),
  "dialog:select-artwork": z.tuple([]),
  "artwork:search": z.tuple([text.max(500)]),
  "ludusavi:search": z.tuple([text.max(500)]),
  "ludusavi:auto-associate": z.tuple([]),
  "library:set-remote-artwork": z.tuple([
    id,
    z
      .object({
        provider: z.enum(["steam", "wikipedia"]),
        providerId: text.min(1),
        title,
        coverUrl: imageUrl,
        heroUrl: imageUrl,
      })
      .refine(
        (value) => value.provider !== "steam" || /^\d{1,12}$/.test(value.providerId),
      ),
  ]),
  "library:add-local": z.tuple([
    localGame
      .extend({
        artworkPath: text.nullable().optional(),
        coverUrl: imageUrl.nullable().optional(),
        heroUrl: imageUrl.nullable().optional(),
      })
      .strict(),
  ]),
  "library:update-local": z.tuple([
    id,
    localGame
      .extend({ playtimeMinutes: z.number().finite().min(0).max(100_000_000) })
      .strict(),
  ]),
  "library:set-cover": z.tuple([id]),
  "library:uninstall-or-hide": z.tuple([id]),
  "library:delete-forever": z.tuple([id, title]),
  "library:launch": z.tuple([id]),
} as const;

export type IpcChannel = keyof typeof ipcContracts;

export type IpcArgs<K extends IpcChannel> = z.output<(typeof ipcContracts)[K]>;
