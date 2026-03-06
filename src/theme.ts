import type { TranslationKey } from "./i18n";

export type AppTheme = "dark" | "light";

const STORAGE_KEY = "electron-tools.theme";
const SUPPORTED_THEMES: AppTheme[] = ["dark", "light"];

export const THEME_OPTIONS: Array<{
  value: AppTheme;
  labelKey: TranslationKey;
}> = [
  { value: "dark", labelKey: "settings.theme.dark" },
  { value: "light", labelKey: "settings.theme.light" }
];

export function getInitialTheme(): AppTheme {
  return readStoredTheme() ?? getSystemTheme();
}

export function readStoredTheme(): AppTheme | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);

  return isSupportedTheme(stored) ? stored : null;
}

export function persistTheme(theme: AppTheme): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function getSystemTheme(): AppTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(theme: AppTheme): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme;
}

function isSupportedTheme(value: string | null): value is AppTheme {
  return value !== null && SUPPORTED_THEMES.includes(value as AppTheme);
}
