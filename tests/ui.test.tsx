import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/client/App";
import { RoundsHistory } from "../src/client/components/RoundsHistory";
import { newId } from "../src/client/id";
import { SessionsScreen } from "../src/client/screens/SessionsScreen";
import { AppearanceSettings } from "../src/client/screens/SettingsScreen";
import { ConfigProvider } from "../src/client/state/config";
import { type AppConfig, type Match, deriveMatch } from "../src/domain";

const config: AppConfig = {
  players: [
    { id: "a", name: "Ali" },
    { id: "b", name: "Bo" },
  ],
  minRaise: 5,
  maxBet: 100,
};

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("client id", () => {
  it("generates a uuid through crypto.randomUUID when available", () => {
    expect(newId()).toMatch(uuidV4);
  });

  it("still generates a uuid when crypto.randomUUID is missing (insecure context)", () => {
    vi.stubGlobal("crypto", {});
    try {
      expect(newId()).toMatch(uuidV4);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("ui smoke", () => {
  it("renders the sessions screen at the root route without a setup redirect", () => {
    const html = renderToString(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell />
      </MemoryRouter>,
    );
    expect(html).toContain("poker.pot");
    expect(html).toContain('aria-label="New session"');
  });

  it("renders the sessions screen inside providers", () => {
    const html = renderToString(
      <MemoryRouter>
        <ConfigProvider>
          <SessionsScreen />
        </ConfigProvider>
      </MemoryRouter>,
    );
    expect(html).toContain("poker.pot");
  });

  it("shows bottom tabs on root screens only", () => {
    const home = renderToString(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell />
      </MemoryRouter>,
    );
    expect(home).toContain('aria-label="Main"');

    const settings = renderToString(
      <MemoryRouter initialEntries={["/settings"]}>
        <AppShell />
      </MemoryRouter>,
    );
    expect(settings).toContain('aria-label="Main"');

    const nested = renderToString(
      <MemoryRouter initialEntries={["/sessions/abc"]}>
        <AppShell />
      </MemoryRouter>,
    );
    expect(nested).not.toContain('aria-label="Main"');
  });

  it("renders the New session FAB on the sessions screen", () => {
    const html = renderToString(
      <MemoryRouter>
        <ConfigProvider>
          <SessionsScreen />
        </ConfigProvider>
      </MemoryRouter>,
    );
    expect(html).toContain('aria-label="New session"');
    expect(html).not.toContain("Add players in settings first");
  });

  it("renders the appearance controls with the active theme and accent selected", () => {
    const html = renderToString(<AppearanceSettings />);
    expect(html).toContain("Appearance");
    expect(html).toContain("<fieldset");
    expect((html.match(/type="radio"/g) ?? []).length).toBe(3);
    expect((html.match(/checked=""/g) ?? []).length).toBe(1);
    expect(html).toContain("Accent color");
    expect((html.match(/data-accent="/g) ?? []).length).toBe(6);
    expect((html.match(/data-selected="true"/g) ?? []).length).toBe(2);
  });

  it("renders round history text for bets and folds", () => {
    const match: Match = {
      id: "m",
      participants: [
        { id: "a", name: "Ali" },
        { id: "b", name: "Bo" },
      ],
      rounds: [
        {
          index: 0,
          actions: [
            { id: "1", playerId: "a", type: "raise", amount: 10, createdAt: "x" },
            { id: "2", playerId: "b", type: "fold", amount: 0, createdAt: "x" },
          ],
        },
      ],
      status: "active",
      winners: [],
      createdAt: "x",
    };
    const derived = deriveMatch(match, config);
    const html = renderToString(
      <RoundsHistory derived={derived} nameOf={(id) => (id === "a" ? "Ali" : "Bo")} />,
    );
    expect(html).toContain("raised to 10");
    expect(html).toContain("folded");
    expect(html).toContain("Ali");
  });
});
