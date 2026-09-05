import { load, JSON_SCHEMA } from "js-yaml";
import type { LudusaviGame } from "./ludusavi.js";

export function parseManifest(text: string): LudusaviGame[] {
  if (Buffer.byteLength(text) > 32 * 1024 * 1024) {
    throw new Error("El catálogo supera el tamaño permitido");
  }

  const document = load(text, { schema: JSON_SCHEMA }) as Record<
    string,
    {
      steam?: { id?: number | string };
      files?: Record<string, { tags?: string[] }>;
    }
  >;

  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("Catálogo no válido");
  }

  const entries = Object.entries(document);

  if (entries.length > 100_000) {
    throw new Error("El catálogo contiene demasiados juegos");
  }
  return entries.map(([name, game]) => ({
    name,
    steamAppId: game?.steam?.id == null ? null : String(game.steam.id),
    files: Object.entries(game?.files ?? {}).map(([path, metadata]) => ({
      path,
      tags: Array.isArray(metadata?.tags)
        ? metadata.tags.filter((tag) => typeof tag === "string")
        : [],
    })),
  }));
}
