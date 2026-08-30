import type { ArtworkSuggestion } from "../shared/types.js";

interface SteamStoreSearchResponse {
  items?: Array<{ id?: number; name?: string }>;
}

interface WikipediaSearchResponse {
  query?: {
    pages?: Array<{
      pageid?: number;
      title?: string;
      index?: number;
      thumbnail?: { source?: string };
      original?: { source?: string };
      terms?: { description?: string[] };
    }>;
  };
}

const searchSteamProvider = async (query: string): Promise<ArtworkSuggestion[]> => {
  const normalized = query.trim();
  if (normalized.length < 2) {
    return [];
  }
  const params = new URLSearchParams({ term: normalized, l: "spanish", cc: "ES" });
  const response = await fetch(
    `https://store.steampowered.com/api/storesearch/?${params}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error("No se pudo consultar el catálogo de arte");
  }
  const payload = (await response.json()) as SteamStoreSearchResponse;
  return (payload.items ?? []).slice(0, 6).flatMap((item) => {
    if (!Number.isSafeInteger(item.id) || typeof item.name !== "string") {
      return [];
    }
    const providerId = String(item.id);
    const base = `https://cdn.cloudflare.steamstatic.com/steam/apps/${providerId}`;
    return [
      {
        provider: "steam" as const,
        providerId,
        title: item.name,
        coverUrl: `${base}/library_600x900_2x.jpg`,
        heroUrl: `${base}/library_hero.jpg`,
      },
    ];
  });
};

const searchWikipediaArtwork = async (query: string): Promise<ArtworkSuggestion[]> => {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: `${query} video game`,
    gsrnamespace: "0",
    gsrlimit: "6",
    prop: "pageimages|pageterms",
    piprop: "thumbnail|original",
    pithumbsize: "600",
    pilimit: "6",
    pilicense: "any",
    wbptterms: "description",
    origin: "*",
  });
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { Accept: "application/json", "User-Agent": "LauncherNext/0.1" },
  });
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as WikipediaSearchResponse;
  return (payload.query?.pages ?? [])
    .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
    .flatMap((page) => {
      const imageUrl = page.thumbnail?.source ?? page.original?.source;
      const description = page.terms?.description?.[0]?.toLowerCase() ?? "";
      if (
        !page.pageid ||
        !page.title ||
        !imageUrl ||
        (!description.includes("video game") && !description.includes("videojuego"))
      )
        return [];
      return [
        {
          provider: "wikipedia" as const,
          providerId: String(page.pageid),
          title: page.title,
          coverUrl: imageUrl,
          heroUrl: imageUrl,
        },
      ];
    })
    .slice(0, 4);
};

export const searchSteamArtwork = async (
  query: string,
): Promise<ArtworkSuggestion[]> => {
  const normalized = query.trim();
  if (normalized.length < 2) {
    return [];
  }
  const [steam, wikipedia] = await Promise.all([
    searchSteamProvider(normalized).catch(() => []),
    searchWikipediaArtwork(normalized).catch(() => []),
  ]);
  return [...steam.slice(0, 4), ...wikipedia].slice(0, 8);
};
