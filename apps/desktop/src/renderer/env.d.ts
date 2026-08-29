import type { LauncherApi } from "../preload/index";

declare global {
  interface Window {
    launcher: LauncherApi;
  }
}

export {};
