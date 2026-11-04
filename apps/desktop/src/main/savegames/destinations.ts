import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { portableRootSchema, restoreTarget } from "./validation.js";

export type BackupRoot = z.infer<typeof portableRootSchema>;

export interface PathContext {
  platform: "windows" | "linux" | "darwin";
  anchors: Partial<Record<NonNullable<BackupRoot["portable"]>["anchor"], string>>;
}

export interface RestoreDestination {
  id: string;
  label: string;
  destination: string | null;
  suggestion: string | null;
}

export const pathKey = (value: string) =>
  process.platform === "win32"
    ? path.resolve(value).toLowerCase()
    : path.resolve(value);

export function describeRoot(root: string, context?: PathContext): BackupRoot | null {
  if (!context) {
    return null;
  }

  // Prefer the most specific base when two known folders overlap.
  const anchors = Object.entries(context.anchors).sort(
    (a, b) => b[1].length - a[1].length,
  );

  for (const [anchor, base] of anchors) {
    const relative = path.relative(base, root).split(path.sep).join("/");

    if (
      !relative ||
      relative === ".." ||
      relative.startsWith("../") ||
      path.isAbsolute(relative)
    ) {
      continue;
    }
    restoreTarget(base, relative);
    const portable = {
      platform: context.platform,
      anchor: anchor as NonNullable<BackupRoot["portable"]>["anchor"],
      relative,
    };
    const identity =
      context.platform === "windows"
        ? JSON.stringify(portable).toLowerCase()
        : JSON.stringify(portable);
    return {
      id: `portable-${createHash("sha256").update(identity).digest("hex")}`,
      label: `<${anchor}>/${relative}`,
      portable,
    };
  }
  return null;
}

export function resolvePortable(root: BackupRoot, context?: PathContext) {
  const portable = root.portable;

  if (
    !portable ||
    !context ||
    (portable.anchor !== "steam-userdata" && portable.platform !== context.platform)
  ) {
    return null;
  }

  const base = context.anchors[portable.anchor];
  return base ? restoreTarget(base, portable.relative) : null;
}

/** Validate every existing ancestor; never create a directory through a symlink. */
export async function validateDestination(destination: string) {
  if (
    !path.isAbsolute(destination) ||
    path.parse(path.resolve(destination)).root === path.resolve(destination)
  ) {
    throw new Error("Selecciona una carpeta específica para las partidas");
  }

  let current = path.resolve(destination);

  while (true) {
    const info = await fs.lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    });

    if (info && (!info.isDirectory() || info.isSymbolicLink())) {
      throw new Error("El destino de partidas contiene un archivo o enlace simbólico");
    }
    if (info && pathKey(await fs.realpath(current)) !== pathKey(current)) {
      throw new Error("El destino de partidas está redirigido por un enlace simbólico");
    }

    const parent = path.dirname(current);

    if (parent === current) {
      break;
    }
    current = parent;
  }
}

export function validateDistinctDestinations(roots: string[]) {
  const keys = roots.map(pathKey);

  if (
    keys.some((root, index) =>
      keys.some(
        (other, otherIndex) =>
          index !== otherIndex &&
          (root === other || root.startsWith(`${other}${path.sep}`)),
      ),
    )
  ) {
    throw new Error(
      "Cada carpeta de la copia necesita un destino distinto, sin solapamientos",
    );
  }
}

/** Several Steam accounts are ambiguous; never select one by directory order or recency. */
export async function findSteamUserdata(
  appId: string | null | undefined,
  steamRoots: string[],
) {
  if (!appId || !/^\d+$/.test(appId)) {
    return undefined;
  }

  const accounts = new Set<string>();

  for (const root of steamRoots) {
    const userdata = await fs.realpath(path.join(root, "userdata")).catch(() => null);

    if (!userdata) {
      continue;
    }

    const entries = await fs.readdir(userdata, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && /^\d+$/.test(entry.name)) {
        accounts.add(path.join(userdata, entry.name, appId));
      }
    }
  }
  return accounts.size === 1 ? [...accounts][0] : undefined;
}

/** OS-known folders (including Proton's Documents link) can legitimately be redirected. */
export async function canonicalizeContext(context: PathContext): Promise<PathContext> {
  const anchors: PathContext["anchors"] = {};

  for (const [anchor, base] of Object.entries(context.anchors)) {
    let current = path.resolve(base);
    const missing: string[] = [];

    while (true) {
      const canonical = await fs
        .realpath(current)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") {
            return null;
          }
          throw error;
        });

      if (canonical) {
        anchors[anchor as keyof PathContext["anchors"]] = path.join(
          canonical,
          ...missing,
        );
        break;
      }

      const parent = path.dirname(current);

      if (parent === current) {
        break;
      }
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
  return { platform: context.platform, anchors };
}
