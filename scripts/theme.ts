import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ACCENTS, type Accent, THEMES, type Theme } from "../src/client/theme";

export const ROLES = [
  "primary",
  "on-primary",
  "primary-container",
  "on-primary-container",
  "surface-tint",
  "inverse-primary",
  "secondary",
  "on-secondary",
  "secondary-container",
  "on-secondary-container",
  "tertiary",
  "on-tertiary",
  "tertiary-container",
  "on-tertiary-container",
  "background",
  "on-surface",
  "on-surface-variant",
  "outline",
  "surface-1",
  "surface-2",
  "surface-3",
  "surface-4",
  "profit",
  "loss",
  "warning",
] as const;

export type Role = (typeof ROLES)[number];
export type Palette = Record<Role, string>;

type PrimaryRoles =
  | "primary"
  | "on-primary"
  | "primary-container"
  | "on-primary-container"
  | "surface-tint"
  | "inverse-primary";

type SecondaryRoles =
  | "secondary"
  | "on-secondary"
  | "secondary-container"
  | "on-secondary-container";

type TertiaryRoles = "tertiary" | "on-tertiary" | "tertiary-container" | "on-tertiary-container";

type NeutralRoles =
  | "background"
  | "on-surface"
  | "outline"
  | "surface-1"
  | "surface-2"
  | "surface-3"
  | "surface-4";

interface Seed {
  hue: number;
  chroma: number;
}

const SEEDS: Record<Accent, Seed> = {
  blue: { hue: 255, chroma: 0.21 },
  teal: { hue: 195, chroma: 0.16 },
  green: { hue: 145, chroma: 0.19 },
  orange: { hue: 45, chroma: 0.21 },
  rose: { hue: 15, chroma: 0.21 },
  violet: { hue: 300, chroma: 0.2 },
};

interface NeutralSet {
  background: string;
  onSurface: string;
  outline: string;
  containerStart: string;
  containerEnd: string;
}

const NEUTRALS: Record<Theme, NeutralSet> = {
  light: {
    background: "#fffbfe",
    onSurface: "#1c1b1f",
    outline: "#79747e",
    containerStart: "#ffffff",
    containerEnd: "#e6e0e9",
  },
  dark: {
    background: "#1c1b1f",
    onSurface: "#e6e1e5",
    outline: "#938f99",
    containerStart: "#0f0d13",
    containerEnd: "#36343b",
  },
  oled: {
    background: "#000000",
    onSurface: "#e8e6ea",
    outline: "#6f6a74",
    containerStart: "#000000",
    containerEnd: "#1f1f23",
  },
};

const OLED_LADDER: [string, string, string, string, string] = [
  "#000000",
  "#0a0a0b",
  "#101012",
  "#17171a",
  "#1f1f23",
];

const STATUS: Record<Theme, Record<"profit" | "loss" | "warning", string>> = {
  light: { profit: "#146c2e", loss: "#b3261e", warning: "#7a5900" },
  dark: { profit: "#6dd58c", loss: "#f2b8b5", warning: "#ffdf9e" },
  oled: { profit: "#6dd58c", loss: "#ffb4ab", warning: "#ffdf9e" },
};

const SHARED_VARIABLES: Record<string, string> = {
  "--radius-sm": "6px",
  "--radius-md": "8px",
  "--radius-lg": "12px",
  "--radius-xl": "16px",
  "--radius-full": "999px",
  "--space-1": "4px",
  "--space-2": "8px",
  "--space-3": "12px",
  "--space-4": "16px",
  "--space-5": "24px",
  "--space-6": "32px",
  "--font-sans":
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  "--text-xs": "12px",
  "--text-sm": "14px",
  "--text-base": "16px",
  "--text-lg": "20px",
  "--text-xl": "24px",
  "--text-2xl": "32px",
  "--control-h": "48px",
  "--control-h-compact": "40px",
  "--topbar-h": "64px",
  "--tabbar-h": "64px",
};

interface Oklch {
  l: number;
  c: number;
  h: number;
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function oklchToLinearSrgb(l: number, c: number, hue: number): [number, number, number] {
  const radians = (hue * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = lPrime ** 3;
  const m3 = mPrime ** 3;
  const s3 = sPrime ** 3;
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
}

export function oklchToHex(l: number, c: number, hue: number): string {
  let chroma = c;
  let rgb = oklchToLinearSrgb(l, chroma, hue);
  while (rgb.some((channel) => channel < 0 || channel > 1)) {
    chroma /= 2;
    rgb = oklchToLinearSrgb(l, chroma, hue);
  }
  return `#${rgb
    .map((channel) =>
      Math.round(linearToSrgb(channel) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function hexToOklch(hex: string): Oklch {
  const [red, green, blue] = hexToRgb(hex);
  const r = srgbToLinear(red);
  const g = srgbToLinear(green);
  const b = srgbToLinear(blue);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lPrime = Math.cbrt(l);
  const mPrime = Math.cbrt(m);
  const sPrime = Math.cbrt(s);
  const lightness = 0.2104542553 * lPrime + 0.793617785 * mPrime - 0.0040720468 * sPrime;
  const a = 1.9779984951 * lPrime - 2.428592205 * mPrime + 0.4505937099 * sPrime;
  const bAxis = 0.0259040371 * lPrime + 0.7827717662 * mPrime - 0.808675766 * sPrime;
  const hue = ((Math.atan2(bAxis, a) * 180) / Math.PI + 360) % 360;
  return { l: lightness, c: Math.hypot(a, bAxis), h: hue };
}

function relativeLuminance(hex: string): number {
  const [red, green, blue] = hexToRgb(hex);
  return 0.2126 * srgbToLinear(red) + 0.7152 * srgbToLinear(green) + 0.0722 * srgbToLinear(blue);
}

export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function rehue(hex: string, hue: number): string {
  const { l, c } = hexToOklch(hex);
  return oklchToHex(l, c, hue);
}

function containerLadder(theme: Theme, hue: number): [string, string, string, string, string] {
  if (theme === "oled") {
    return [...OLED_LADDER];
  }
  const start = hexToOklch(NEUTRALS[theme].containerStart);
  const end = hexToOklch(NEUTRALS[theme].containerEnd);
  const at = (t: number): string =>
    oklchToHex(start.l + (end.l - start.l) * t, start.c + (end.c - start.c) * t, hue);
  return [at(0), at(0.25), at(0.5), at(0.75), at(1)];
}

function primaryFamily(theme: Theme, seed: Seed): Record<PrimaryRoles, string> {
  if (theme === "light") {
    return {
      primary: oklchToHex(0.4955, seed.chroma, seed.hue),
      "on-primary": oklchToHex(1, 0, seed.hue),
      "primary-container": oklchToHex(0.918, seed.chroma * 0.36, seed.hue),
      "on-primary-container": oklchToHex(0.24, seed.chroma * 1.05, seed.hue),
      "surface-tint": oklchToHex(0.4955, seed.chroma, seed.hue),
      "inverse-primary": oklchToHex(0.835, seed.chroma * 0.72, seed.hue),
    };
  }
  return {
    primary: oklchToHex(0.74, seed.chroma, seed.hue),
    "on-primary": oklchToHex(0.325, seed.chroma * 1.04, seed.hue),
    "primary-container": oklchToHex(0.41, seed.chroma * 1.02, seed.hue),
    "on-primary-container": oklchToHex(0.918, seed.chroma * 0.36, seed.hue),
    "surface-tint": oklchToHex(0.74, seed.chroma, seed.hue),
    "inverse-primary": oklchToHex(0.4955, seed.chroma, seed.hue),
  };
}

function secondaryFamily(theme: Theme, seed: Seed): Record<SecondaryRoles, string> {
  const base = seed.chroma * 0.28;
  if (theme === "light") {
    return {
      secondary: oklchToHex(0.4859, base, seed.hue),
      "on-secondary": oklchToHex(1, 0, seed.hue),
      "secondary-container": oklchToHex(0.9163, base * 1.02, seed.hue),
      "on-secondary-container": oklchToHex(0.2272, base * 0.97, seed.hue),
    };
  }
  return {
    secondary: oklchToHex(0.8303, base * 1.04, seed.hue),
    "on-secondary": oklchToHex(0.3124, base * 1.01, seed.hue),
    "secondary-container": oklchToHex(0.4005, base * 0.95, seed.hue),
    "on-secondary-container": oklchToHex(0.9163, base * 1.02, seed.hue),
  };
}

function tertiaryFamily(theme: Theme, seed: Seed): Record<TertiaryRoles, string> {
  const base = seed.chroma * 0.46;
  const hue = seed.hue + 60;
  if (theme === "light") {
    return {
      tertiary: oklchToHex(0.4904, base, hue),
      "on-tertiary": oklchToHex(1, 0, hue),
      "tertiary-container": oklchToHex(0.9184, base * 0.76, hue),
      "on-tertiary-container": oklchToHex(0.2323, base * 0.9, hue),
    };
  }
  return {
    tertiary: oklchToHex(0.8367, base * 1.1, hue),
    "on-tertiary": oklchToHex(0.3171, base * 0.94, hue),
    "tertiary-container": oklchToHex(0.4044, base * 0.98, hue),
    "on-tertiary-container": oklchToHex(0.9184, base * 0.76, hue),
  };
}

function neutralRoles(theme: Theme, hue: number): Record<NeutralRoles, string> {
  const ladder = containerLadder(theme, hue);
  return {
    background: rehue(NEUTRALS[theme].background, hue),
    "on-surface": rehue(NEUTRALS[theme].onSurface, hue),
    outline: rehue(NEUTRALS[theme].outline, hue),
    "surface-1": ladder[1],
    "surface-2": ladder[2],
    "surface-3": ladder[3],
    "surface-4": ladder[4],
  };
}

function minimumContrast(hex: string, references: readonly string[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const reference of references) {
    minimum = Math.min(minimum, contrastRatio(hex, reference));
  }
  return minimum;
}

function accessibleOnSurfaceVariant(
  theme: Theme,
  accent: Accent,
  references: readonly string[],
): string {
  const outline = hexToOklch(NEUTRALS[theme].outline);
  const step = theme === "light" ? -0.005 : 0.005;
  for (let index = 0; index < 200; index += 1) {
    const lightness = outline.l + step * index;
    if (lightness < 0 || lightness > 1) {
      break;
    }
    const candidate = oklchToHex(lightness, outline.c, SEEDS[accent].hue);
    if (minimumContrast(candidate, references) >= 4.5) {
      return candidate;
    }
  }
  throw new Error(`no accessible on-surface-variant for ${theme}/${accent}`);
}

export function buildPalette(theme: Theme, accent: Accent): Palette {
  const seed = SEEDS[accent];
  const withoutVariant: Omit<Palette, "on-surface-variant"> = {
    ...primaryFamily(theme, seed),
    ...secondaryFamily(theme, seed),
    ...tertiaryFamily(theme, seed),
    ...neutralRoles(theme, seed.hue),
    ...STATUS[theme],
  };
  return {
    ...withoutVariant,
    "on-surface-variant": accessibleOnSurfaceVariant(theme, accent, [
      withoutVariant.background,
      withoutVariant["surface-1"],
      withoutVariant["surface-2"],
      withoutVariant["surface-3"],
      withoutVariant["surface-4"],
    ]),
  };
}

function roleLines(palette: Palette, indent: string, scheme: "light" | "dark"): string[] {
  return [
    ...ROLES.map((role) => `${indent}--${role}: ${palette[role]};`),
    `${indent}color-scheme: ${scheme};`,
  ];
}

function swatchSection(): string {
  const lines: string[] = [];
  for (const accent of ACCENTS) {
    lines.push(
      `[data-swatch="${accent}"] {`,
      `  --swatch-light: ${buildPalette("light", accent).primary};`,
      `  --swatch-dark: ${buildPalette("dark", accent).primary};`,
      "}",
    );
  }
  return lines.join("\n");
}

export function generateTokensCss(): string {
  const sections: string[] = [];
  sections.push("/* Generated by `bun run theme` — do not edit by hand. */");
  sections.push(
    [
      ":root {",
      ...Object.entries(SHARED_VARIABLES).map(([name, value]) => `  ${name}: ${value};`),
      "}",
    ].join("\n"),
  );
  sections.push(
    [":root {", ...roleLines(buildPalette("light", "blue"), "  ", "light"), "}"].join("\n"),
  );
  sections.push(
    [
      "@media (prefers-color-scheme: dark) {",
      "  :root:not([data-theme]) {",
      ...roleLines(buildPalette("dark", "blue"), "    ", "dark"),
      "  }",
      "}",
    ].join("\n"),
  );
  for (const theme of THEMES) {
    for (const accent of ACCENTS) {
      sections.push(
        [
          `:root[data-theme="${theme}"][data-accent="${accent}"] {`,
          ...roleLines(buildPalette(theme, accent), "  ", theme === "light" ? "light" : "dark"),
          "}",
        ].join("\n"),
      );
    }
  }
  sections.push(swatchSection());
  return `${sections.join("\n\n")}\n`;
}

if (import.meta.main) {
  mkdirSync(fileURLToPath(new URL("../src/client/styles", import.meta.url)), { recursive: true });
  writeFileSync(new URL("../src/client/styles/tokens.css", import.meta.url), generateTokensCss());
}
