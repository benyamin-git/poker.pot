import { describe, expect, it } from "vitest";
import { type TurnState, isToAct, nextToAct } from "../src/client/screens/MatchScreen";

const folded: TurnState = { folded: true, allIn: false, acted: true, roundTotal: 0 };
const allIn: TurnState = { folded: false, allIn: true, acted: true, roundTotal: 100 };
const fresh: TurnState = { folded: false, allIn: false, acted: false, roundTotal: 0 };
const behind: TurnState = { folded: false, allIn: false, acted: true, roundTotal: 10 };
const settled: TurnState = { folded: false, allIn: false, acted: true, roundTotal: 20 };

describe("isToAct", () => {
  it("marks a player who has not acted yet as to act", () => {
    expect(isToAct(fresh, 0)).toBe(true);
    expect(isToAct(fresh, 20)).toBe(true);
  });

  it("marks a player behind the current round high as to act", () => {
    expect(isToAct(behind, 20)).toBe(true);
  });

  it("does not mark settled, folded, or all-in players", () => {
    expect(isToAct(settled, 20)).toBe(false);
    expect(isToAct(folded, 20)).toBe(false);
    expect(isToAct(allIn, 20)).toBe(false);
  });
});

describe("nextToAct", () => {
  const players = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns the first player to act in render order", () => {
    const states: Record<string, TurnState> = { a: folded, b: behind, c: fresh };
    const next = nextToAct(players, (player) => states[player.id] ?? fresh, 20);
    expect(next?.id).toBe("b");
  });

  it("returns undefined when nobody can act", () => {
    const states: Record<string, TurnState> = { a: folded, b: settled, c: allIn };
    const next = nextToAct(players, (player) => states[player.id] ?? fresh, 20);
    expect(next).toBeUndefined();
  });
});
