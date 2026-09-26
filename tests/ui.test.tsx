import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RoundsHistory } from "../src/client/components/RoundsHistory";
import { newId } from "../src/client/id";
import { SessionsScreen } from "../src/client/screens/SessionsScreen";
import { SetupScreen } from "../src/client/screens/SetupScreen";
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
  it("renders the first-run setup screen", () => {
    const html = renderToString(
      <MemoryRouter>
        <SetupScreen />
      </MemoryRouter>,
    );
    expect(html).toContain("private data folder");
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
