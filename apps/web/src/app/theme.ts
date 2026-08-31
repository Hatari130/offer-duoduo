export type ColorTheme = "light" | "dark";

export const COLOR_THEME_STORAGE_KEY = "offerflow:color-theme";

export function resolveColorTheme(storedTheme: string | null, prefersDark: boolean): ColorTheme {
  if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  return prefersDark ? "dark" : "light";
}

export function readStoredColorTheme(): ColorTheme | undefined {
  try {
    const storedTheme = window.localStorage.getItem(COLOR_THEME_STORAGE_KEY);
    return storedTheme === "light" || storedTheme === "dark" ? storedTheme : undefined;
  } catch {
    return undefined;
  }
}

export function getInitialColorTheme(): ColorTheme {
  const storedTheme = readStoredColorTheme();
  return resolveColorTheme(storedTheme || null, window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
}

export function applyColorTheme(theme: ColorTheme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0b1018" : "#f7f9fe");
}

export function persistColorTheme(theme: ColorTheme): void {
  try {
    window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme);
  } catch {
    // The appearance switch still works for this page when storage is unavailable.
  }
}
