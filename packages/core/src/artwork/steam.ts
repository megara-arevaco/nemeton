export interface SteamArtwork {
  coverUrl: string;
  heroUrl: string;
}

interface SteamStoreAppDetails {
  [appId: string]: {
    success?: unknown;
    data?: {
      background?: unknown;
      capsule_image?: unknown;
      header_image?: unknown;
      screenshots?: Array<{ path_full?: unknown }>;
    };
  };
}

const isUrl = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("https://");

export const steamFallbackArtwork = (appId: string): SteamArtwork => {
  const base = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}`;
  return {
    coverUrl: `${base}/header.jpg`,
    heroUrl: `${base}/header.jpg`,
  };
};

export const fetchSteamStoreArtwork = async (appId: string): Promise<SteamArtwork> => {
  const fallback = steamFallbackArtwork(appId);
  const params = new URLSearchParams({ appids: appId, l: "spanish", cc: "ES" });
  const response = await fetch(
    `https://store.steampowered.com/api/appdetails?${params}`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6_000),
    },
  );

  if (!response.ok) {
    return fallback;
  }

  const app = ((await response.json()) as SteamStoreAppDetails)[appId];

  if (!app || app.success !== true) {
    return fallback;
  }

  const data = app.data;
  const screenshot = data?.screenshots?.map((item) => item.path_full).find(isUrl);
  const header = isUrl(data?.header_image) ? data.header_image : fallback.coverUrl;

  return {
    coverUrl: isUrl(data?.capsule_image) ? data.capsule_image : header,
    heroUrl: isUrl(data?.background) ? data.background : (screenshot ?? header),
  };
};
