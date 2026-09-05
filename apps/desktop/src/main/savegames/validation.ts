import path from "node:path";
import { z } from "zod";
import { MAX_BACKUP_BYTES, MAX_FILES } from "./archive.js";

export const versionIdSchema = z
  .string()
  .min(1)
  .max(240)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const manifestSchema = z
  .object({
    id: versionIdSchema,
    createdAt: z.string().datetime(),
    deviceId: z.string().max(240),
    deviceName: z.string().max(240),
    sizeBytes: z.number().int().min(0).max(MAX_BACKUP_BYTES),
    fileCount: z.number().int().min(0).max(MAX_FILES),
    pinned: z.boolean().optional(),
    files: z
      .array(
        z.object({
          rootIndex: z.number().int().min(0).max(1000),
          rootKey: z.string().max(4096).optional(),
          relativePath: z.string().min(1).max(4096),
          hash: z.string().regex(/^[a-f0-9]{64}$/),
          size: z.number().int().min(0).max(MAX_BACKUP_BYTES),
          archivePath: z.string().min(1).max(4096).optional(),
        }),
      )
      .max(MAX_FILES),
  })
  .superRefine((manifest, context) => {
    if (
      manifest.fileCount !== manifest.files.length ||
      manifest.sizeBytes !==
        manifest.files.reduce((total, file) => total + file.size, 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "El manifiesto no coincide con sus archivos",
      });
    }
  });

export function restoreTarget(root: string, relative: string) {
  const segments = relative.replaceAll("\\", "/").split("/");

  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        /[:\x00-\x1f]/.test(segment) ||
        /[. ]$/.test(segment) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment),
    )
  ) {
    throw new Error("La copia contiene una ruta no válida");
  }

  const target = path.resolve(root, ...segments);

  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error("La copia contiene una ruta no válida");
  }
  return target;
}
