import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RoundsHistory } from "../src/client/components/RoundsHistory";
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
