import type { LibraryGame } from "@launcher/core";
export type AccentTheme = "forest" | "aurora" | "ember" | "amethyst" | "glacier";

export const accentThemes: Array<{
  id: AccentTheme;
  name: string;
  description: string;
  colors: [string, string];
}> = [
  {
    id: "forest",
    name: "Bosque",
    description: "Verde y cian",
    colors: ["#b7ff64", "#65f0b5"],
  },
  {
    id: "aurora",
    name: "Aurora",
    description: "Cian y violeta",
    colors: ["#47e9ff", "#8e7cff"],
  },
  {
    id: "ember",
    name: "Brasa",
    description: "Ámbar y coral",
    colors: ["#ffd15c", "#ff7b67"],
  },
  {
    id: "amethyst",
    name: "Amatista",
    description: "Violeta y rosa",
    colors: ["#bd8cff", "#ff79bd"],
  },
  {
    id: "glacier",
    name: "Glaciar",
    description: "Azul y hielo",
    colors: ["#72a7ff", "#78f0ec"],
  },
];

export const formatPlaytime = (minutes: number) => {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  return `${Math.round((minutes / 60) * 10) / 10} h`;
};

export const formatLastPlayed = (value: string | null) => {
  if (!value) {
    return "Nunca";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Nunca";
  }

  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
  const daysAgo = Math.round((startOfToday - startOfDate) / 86_400_000);

  if (daysAgo === 0) {
    return "Hoy";
  }
  if (daysAgo === 1) {
    return "Ayer";
  }
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(date);
};

export const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;

const localCoverUrl = (coverPath: string) =>
  `launcher-cover:///${encodeURIComponent(coverPath)}`;

export const gameCoverUrl = (game: LibraryGame) =>
  game.coverPath ? localCoverUrl(game.coverPath) : game.coverUrl;

export const gameHeroUrl = (game: LibraryGame) =>
  game.coverPath ? localCoverUrl(game.coverPath) : (game.heroUrl ?? game.coverUrl);
