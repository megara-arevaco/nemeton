export const queryKeys = {
  library: ["library"] as const,
  steamSettings: ["steam-settings"] as const,
  syncSettings: ["sync-settings"] as const,
  runningGames: ["running-games"] as const,
  achievements: (gameId: string) => ["achievements", gameId] as const,
  metadata: (gameId: string) => ["metadata", gameId] as const,
  savegames: (gameId: string) => ["savegames", gameId] as const,
  artwork: (query: string) => ["artwork", query] as const,
  ludusavi: (query: string) => ["ludusavi", query] as const,
};
