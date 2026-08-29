import type { ReactNode } from "react";
import { ThemeContext, useThemeProvider } from "./ThemeProvider.hook";

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const value = useThemeProvider();

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
