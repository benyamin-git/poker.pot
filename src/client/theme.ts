import { useSyncExternalStore } from "react";

export const THEMES = ["light", "dark", "oled"] as const;
export type Theme = (typeof THEMES)[number];
export const ACCENTS = ["blue", "teal", "green", "orange", "rose", "violet"] as const;
export type Accent = (typeof ACCENTS)[number];
export const DEFAULT_THEME: Theme = "light";
export const DEFAULT_ACCENT: Accent = "blue";
export const THEME_KEY = "poker.pot:theme";
export const ACCENT_KEY = "poker.pot:accent";

export interface Appearance {
  theme: Theme;
  accent: Accent;
}

const THEME_COLORS: Record<Theme, string> = {
  light: "#fffbfe",
  dark: "#1c1b1f",
  oled: "#000000",
};

type AppearanceListener = () => void;

const listeners = new Set<AppearanceListener>();

let snapshot: Appearance | null = null;

function isTheme(value: string | null | undefined): value is Theme {
  return value != null && THEMES.some((theme) => theme === value);
}

function isAccent(value: string | null | undefined): value is Accent {
  return value != null && ACCENTS.some((accent) => accent === value);
}

function prefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

function localStore(): Pick<Storage, "getItem" | "setItem"> | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

export function resolveFirstTheme(prefersDark: boolean): Theme {
  return prefersDark ? "dark" : "light";
}

export function themeColorFor(theme: Theme): string {
  return THEME_COLORS[theme];
}

export function readAppearance(storage?: Pick<Storage, "getItem">): Appearance {
  const fallback: Appearance = {
    theme: resolveFirstTheme(prefersDark()),
    accent: DEFAULT_ACCENT,
  };
  try {
    const source = storage ?? localStore();
    const storedTheme = source?.getItem(THEME_KEY);
    const storedAccent = source?.getItem(ACCENT_KEY);
    return {
      theme: isTheme(storedTheme) ? storedTheme : fallback.theme,
      accent: isAccent(storedAccent) ? storedAccent : fallback.accent,
    };
  } catch {
    return fallback;
  }
}

export function applyAppearance(
  next: Appearance,
  doc?: Pick<Document, "documentElement" | "querySelector">,
): void {
  const target = doc ?? (typeof document === "undefined" ? undefined : document);
  if (!target) {
    return;
  }
  target.documentElement.dataset.theme = next.theme;
  target.documentElement.dataset.accent = next.accent;
  target.documentElement.style.colorScheme = next.theme === "light" ? "light" : "dark";
  target
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", themeColorFor(next.theme));
}

export function subscribeAppearance(listener: AppearanceListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAppearanceSnapshot(): Appearance {
  snapshot ??= readAppearance();
  return snapshot;
}

function persistAppearance(next: Appearance): void {
  try {
    const source = localStore();
    source?.setItem(THEME_KEY, next.theme);
    source?.setItem(ACCENT_KEY, next.accent);
  } catch {
    return;
  }
}

export function setAppearance(next: Appearance): void {
  if (!isTheme(next.theme) || !isAccent(next.accent)) {
    return;
  }
  snapshot = next;
  persistAppearance(next);
  applyAppearance(next);
  for (const listener of listeners) {
    listener();
  }
}

export function useAppearance(): [Appearance, (next: Appearance) => void] {
  const appearance = useSyncExternalStore(
    subscribeAppearance,
    getAppearanceSnapshot,
    getAppearanceSnapshot,
  );
  return [appearance, setAppearance];
}
