import { describe, expect, it } from "vitest";
import {
  ACCENT_KEY,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  THEME_KEY,
  applyAppearance,
  readAppearance,
  resolveFirstTheme,
  themeColorFor,
} from "../src/client/theme";

function fakeStorage(values: Record<string, string>): Pick<Storage, "getItem"> {
  return {
    getItem: (key: string) => values[key] ?? null,
  };
}

interface FakeMeta {
  content: string;
}

function fakeDocument(): {
  doc: Pick<Document, "documentElement" | "querySelector">;
  dataset: Record<string, string>;
  style: { colorScheme?: string };
  meta: FakeMeta;
} {
  const dataset: Record<string, string> = {};
  const style: { colorScheme?: string } = {};
  const meta: FakeMeta = { content: "" };
  const doc = {
    documentElement: { dataset, style },
    querySelector: (selector: string) =>
      selector === 'meta[name="theme-color"]'
        ? {
            setAttribute: (name: string, value: string) => {
              if (name === "content") {
                meta.content = value;
              }
            },
          }
        : null,
  };
  return {
    doc: doc as unknown as Pick<Document, "documentElement" | "querySelector">,
    dataset,
    style,
    meta,
  };
}

describe("resolveFirstTheme", () => {
  it("maps a dark OS preference to Dark and light to Light", () => {
    expect(resolveFirstTheme(true)).toBe("dark");
    expect(resolveFirstTheme(false)).toBe("light");
  });
});

describe("readAppearance", () => {
  it("reads valid stored values", () => {
    expect(readAppearance(fakeStorage({ [THEME_KEY]: "oled", [ACCENT_KEY]: "violet" }))).toEqual({
      theme: "oled",
      accent: "violet",
    });
  });

  it("falls back to defaults for invalid stored values", () => {
    const stored = fakeStorage({ [THEME_KEY]: "neon", [ACCENT_KEY]: "chartreuse" });
    expect(readAppearance(stored)).toEqual({
      theme: DEFAULT_THEME,
      accent: DEFAULT_ACCENT,
    });
  });

  it("falls back to defaults for empty storage without matchMedia", () => {
    expect(readAppearance(fakeStorage({}))).toEqual({
      theme: DEFAULT_THEME,
      accent: DEFAULT_ACCENT,
    });
  });
});

describe("themeColorFor", () => {
  it("maps each theme to its system color", () => {
    expect(themeColorFor("light")).toBe("#fffbfe");
    expect(themeColorFor("dark")).toBe("#1c1b1f");
    expect(themeColorFor("oled")).toBe("#000000");
  });
});

describe("applyAppearance", () => {
  it("sets the attributes, color-scheme, and meta color for a dark family theme", () => {
    const { doc, dataset, style, meta } = fakeDocument();
    applyAppearance({ theme: "oled", accent: "rose" }, doc);
    expect(dataset.theme).toBe("oled");
    expect(dataset.accent).toBe("rose");
    expect(style.colorScheme).toBe("dark");
    expect(meta.content).toBe("#000000");
  });

  it("sets light color-scheme and the light meta color for Light", () => {
    const { doc, style, meta } = fakeDocument();
    applyAppearance({ theme: "light", accent: "green" }, doc);
    expect(style.colorScheme).toBe("light");
    expect(meta.content).toBe("#fffbfe");
  });
});
