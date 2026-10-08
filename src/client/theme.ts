export const THEMES = ["light", "dark", "oled"] as const;
export type Theme = (typeof THEMES)[number];
export const ACCENTS = ["blue", "teal", "green", "orange", "rose", "violet"] as const;
export type Accent = (typeof ACCENTS)[number];
export const DEFAULT_THEME: Theme = "light";
export const DEFAULT_ACCENT: Accent = "blue";
export const THEME_KEY = "poker.pot:theme";
export const ACCENT_KEY = "poker.pot:accent";
