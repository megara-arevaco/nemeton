import { createContext, use, useEffect, useState } from "react";
import { accentThemes, type AccentTheme } from "../../shared/presentation";

export interface ThemeContextValue {
  accentTheme: AccentTheme;
  setAccentTheme: (theme: AccentTheme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useThemeProvider(): ThemeContextValue {
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => {
    const stored = window.localStorage.getItem("nemeton.accent-theme");
    return accentThemes.some((theme) => theme.id === stored)
      ? (stored as AccentTheme)
      : "forest";
  });

  useEffect(() => {
    document.documentElement.dataset.accent = accentTheme;
    window.localStorage.setItem("nemeton.accent-theme", accentTheme);
  }, [accentTheme]);

  return {
    accentTheme,
    setAccentTheme,
  };
}

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
}
