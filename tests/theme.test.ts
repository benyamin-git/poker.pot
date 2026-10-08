import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROLES, buildPalette, contrastRatio, generateTokensCss } from "../scripts/theme";
import { ACCENTS, type Accent, THEMES } from "../src/client/theme";

const HEX_COLOR = /^#[0-9a-f]{6}$/;

const DOCUMENTED_PRIMARIES: Record<Accent, { dark: string; light: string }> = {
  blue: { dark: "#7daeec", light: "#35639c" },
  teal: { dark: "#69bbba", light: "#127070" },
  green: { dark: "#4bc957", light: "#3c703f" },
  orange: { dark: "#e29572", light: "#924c2b" },
  rose: { dark: "#e58f95", light: "#94464e" },
  violet: { dark: "#b49ce1", light: "#7638c0" },
};

const COMBINATIONS = THEMES.flatMap((theme) => ACCENTS.map((accent) => ({ theme, accent })));

const CONTRAST_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["on-surface", "background"],
  ["on-surface", "surface-1"],
  ["on-surface", "surface-2"],
  ["on-surface", "surface-3"],
  ["on-surface", "surface-4"],
  ["on-surface-variant", "background"],
  ["on-surface-variant", "surface-1"],
  ["on-surface-variant", "surface-2"],
  ["on-surface-variant", "surface-3"],
  ["on-surface-variant", "surface-4"],
  ["on-primary", "primary"],
  ["on-primary-container", "primary-container"],
  ["on-secondary-container", "secondary-container"],
  ["on-tertiary-container", "tertiary-container"],
  ["profit", "background"],
  ["loss", "background"],
  ["warning", "background"],
];

function role(palette: Record<string, string>, name: string): string {
  const value = palette[name];
  if (!value) {
    throw new Error(`missing role ${name}`);
  }
  return value;
}

describe("buildPalette", () => {
  it("reproduces the documented primary colors", () => {
    for (const accent of ACCENTS) {
      const documented = DOCUMENTED_PRIMARIES[accent];
      expect(buildPalette("light", accent).primary, `light ${accent}`).toBe(documented.light);
      expect(buildPalette("dark", accent).primary, `dark ${accent}`).toBe(documented.dark);
      expect(buildPalette("oled", accent).primary, `oled ${accent}`).toBe(documented.dark);
    }
  });

  it("defines exactly the documented roles for all 18 combinations", () => {
    for (const { theme, accent } of COMBINATIONS) {
      const palette = buildPalette(theme, accent);
      expect(Object.keys(palette).sort(), `${theme}/${accent}`).toEqual([...ROLES].sort());
      for (const name of ROLES) {
        expect(palette[name], `${theme}/${accent} ${name}`).toMatch(HEX_COLOR);
      }
    }
  });
});

describe("contrastRatio", () => {
  it("scores extremes at 21:1 and is symmetric", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
});

describe("token stylesheet", () => {
  it("is byte-identical to fresh generator output", () => {
    const committed = readFileSync(
      new URL("../src/client/styles/tokens.css", import.meta.url),
      "utf8",
    );
    expect(committed).toBe(generateTokensCss());
  });

  it("emits a preview color for every accent swatch", () => {
    const css = generateTokensCss();
    for (const accent of ACCENTS) {
      expect(css, accent).toContain(`[data-swatch="${accent}"]`);
      expect(css, accent).toContain(DOCUMENTED_PRIMARIES[accent].light);
      expect(css, accent).toContain(DOCUMENTED_PRIMARIES[accent].dark);
    }
  });

  it("meets the body-text contrast floor in every combination", () => {
    for (const { theme, accent } of COMBINATIONS) {
      const palette = buildPalette(theme, accent);
      for (const [foreground, background] of CONTRAST_PAIRS) {
        const ratio = contrastRatio(role(palette, foreground), role(palette, background));
        expect(
          ratio,
          `${theme}/${accent} ${foreground} on ${background} = ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
