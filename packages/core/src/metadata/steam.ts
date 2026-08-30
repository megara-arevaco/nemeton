import type { GameMetadata } from "../shared/types.js";

interface SteamAppDetails {
  success?: unknown;
  data?: {
    name?: unknown;
    short_description?: unknown;
    genres?: unknown;
    developers?: unknown;
    publishers?: unknown;
    release_date?: {
      date?: unknown;
    };
    website?: unknown;
  };
}

interface SteamGenre {
  description?: unknown;
}

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      )
    : [];

export const parseSteamGameMetadata = (
  appId: string,
  payload: unknown,
): GameMetadata | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const response = (payload as Record<string, unknown>)[appId];
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return null;
  }

  const { success, data } = response as SteamAppDetails;
  if (success !== true || !data || typeof data !== "object") {
    return null;
  }

  const genres = Array.isArray(data.genres)
    ? data.genres
        .filter(
          (genre): genre is SteamGenre => Boolean(genre) && typeof genre === "object",
        )
        .flatMap((genre) =>
          typeof genre.description === "string" && genre.description.length > 0
            ? [genre.description]
            : [],
        )
    : [];

  return {
    appId,
    description:
      typeof data.short_description === "string" ? data.short_description : "",
    genres,
    developers: asStringArray(data.developers),
    publishers: asStringArray(data.publishers),
    releaseDate:
      typeof data.release_date?.date === "string" ? data.release_date.date : null,
    website:
      typeof data.website === "string" && data.website.length > 0 ? data.website : null,
  };
};

export const fetchSteamGameMetadata = async (
  appId: string,
): Promise<GameMetadata | null> => {
  if (!/^\d+$/.test(appId)) {
    return null;
  }

  const query = new URLSearchParams({ appids: appId, l: "spanish", cc: "ES" });
  const response = await fetch(
    `https://store.steampowered.com/api/appdetails?${query}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    throw new Error("No se pudo consultar la ficha de Steam");
  }

  return parseSteamGameMetadata(appId, await response.json());
};
