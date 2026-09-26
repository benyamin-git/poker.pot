import { describe, expect, it } from "vitest";
import {
  type AppConfig,
  type Command,
  type Deps,
  DomainError,
  type PlayerSnapshot,
  type Session,
  applyCommand,
  createSession,
  deriveMatch,
  isRoundComplete,
  sessionBalances,
} from "../src/domain";
import { mulberry32 } from "../src/domain/rng";

const players: PlayerSnapshot[] = [
  { id: "a", name: "Ali" },
  { id: "b", name: "Bo" },
  { id: "c", name: "Cy" },
];

const config: AppConfig = { players, minRaise: 5, maxBet: 100 };

let idCounter = 0;

function deps(random = 0.5): Deps {
  return {
    now: () => "2026-01-01T00:00:00.000Z",
    newId: () => `id${++idCounter}`,
    random: () => random,
  };
}

function freshSession(ids = ["a", "b", "c"]): Session {
  const roster = players.filter((p) => ids.includes(p.id));
  return createSession("s1", "Test night", roster, "2026-01-01T00:00:00.000Z");
}

function run(session: Session, command: Command, d = deps()): Session {
  return applyCommand(session, config, command, d);
}

function startMatch(session: Session, participantIds: string[], d = deps()): Session {
  return run(session, { type: "startMatch", participantIds }, d);
}

function lastMatch(session: Session) {
  const match = session.matches[session.matches.length - 1];
  if (!match) throw new Error("no match");
  return match;
}

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`expected DomainError ${code}, but nothing was thrown`);
}

describe("match derivation", () => {
  it("starts empty with zero pot", () => {
    const derived = deriveMatch(
      lastMatch(startMatch(freshSession(["a", "b"]), ["a", "b"])),
      config,
    );
    expect(derived.pot).toBe(0);
    expect(derived.active).toEqual(["a", "b"]);
    expect(derived.rounds).toHaveLength(0);
  });

  it("forbids checking preflop and calling with nothing to call", () => {
    const s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    expectCode(
      () =>
        run(s, {
          type: "recordAction",
          matchId: lastMatch(s).id,
          playerId: "a",
          actionType: "check",
        }),
      "action-not-allowed",
    );
    expectCode(
      () =>
        run(s, {
          type: "recordAction",
          matchId: lastMatch(s).id,
          playerId: "a",
          actionType: "call",
        }),
      "invalid-call",
    );
  });

  it("enforces min-raise and preflop raise-to-continue", () => {
    const s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    const id = lastMatch(s).id;
    const afterA = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "a",
      actionType: "raise",
      amount: 5,
    });
    expectCode(
      () =>
        run(afterA, {
          type: "recordAction",
          matchId: id,
          playerId: "b",
          actionType: "raise",
          amount: 5,
        }),
      "raise-too-small",
    );
    const afterB = run(afterA, {
      type: "recordAction",
      matchId: id,
      playerId: "b",
      actionType: "raise",
      amount: 10,
    });
    const derived = deriveMatch(lastMatch(afterB), config);
    expect(derived.pot).toBe(15);
    expect(derived.rounds[0]?.actions.map((a) => a.roundTotal)).toEqual([5, 10]);
  });

  it("resolves call against the current round high and allows check in later rounds", () => {
    let s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    const id = lastMatch(s).id;
    s = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "a",
      actionType: "raise",
      amount: 5,
    });
    s = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "b",
      actionType: "raise",
      amount: 10,
    });
    s = run(s, { type: "recordAction", matchId: id, playerId: "a", actionType: "call" });
    s = run(s, { type: "recordAction", matchId: id, playerId: "a", actionType: "check" });
    s = run(s, { type: "recordAction", matchId: id, playerId: "b", actionType: "check" });
    s = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "a",
      actionType: "raise",
      amount: 20,
    });
    s = run(s, { type: "recordAction", matchId: id, playerId: "b", actionType: "call" });
    const derived = deriveMatch(lastMatch(s), config);
    expect(derived.rounds).toHaveLength(3);
    const round3 = derived.rounds[2];
    expect(round3?.actions.find((a) => a.playerId === "b")?.added).toBe(20);
    expect(derived.pot).toBe(10 + 10 + 0 + 0 + 20 + 20);
  });

  it("reopens the action after a raise until everyone has matched", () => {
    let s = startMatch(freshSession(["a", "b", "c"]), ["a", "b", "c"]);
    const id = lastMatch(s).id;
    s = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "a",
      actionType: "raise",
      amount: 10,
    });
    s = run(s, { type: "recordAction", matchId: id, playerId: "b", actionType: "call" });
    s = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "c",
      actionType: "raise",
      amount: 20,
    });
    // c raised, so a and b are behind again and the round must stay open.
    expect(isRoundComplete(deriveMatch(lastMatch(s), config))).toBe(false);
    s = run(s, { type: "recordAction", matchId: id, playerId: "a", actionType: "call" });
    expect(isRoundComplete(deriveMatch(lastMatch(s), config))).toBe(false);
    s = run(s, { type: "recordAction", matchId: id, playerId: "b", actionType: "call" });
    const derived = deriveMatch(lastMatch(s), config);
    expect(isRoundComplete(derived)).toBe(true);
    expect(derived.rounds).toHaveLength(1);
    expect(derived.contributions).toEqual({ a: 20, b: 20, c: 20 });
  });

  it("clamps bets at the cumulative max bet (all-in)", () => {
    let s = startMatch(freshSession(["a", "b", "c"]), ["a", "b", "c"]);
    const id = lastMatch(s).id;
    s = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "a",
      actionType: "raise",
      amount: 150,
    });
    const derived = deriveMatch(lastMatch(s), config);
    expect(derived.contributions.a).toBe(100);
    expect(derived.allIn).toContain("a");
    expect(derived.rounds[0]?.actions[0]?.shortAllIn).toBe(true);
  });

  it("ends the match automatically when only one player remains", () => {
    let s = startMatch(freshSession(["a", "b", "c"]), ["a", "b", "c"]);
    const id = lastMatch(s).id;
    s = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "a",
      actionType: "raise",
      amount: 10,
    });
    s = run(s, { type: "recordAction", matchId: id, playerId: "b", actionType: "fold" });
    s = run(s, { type: "recordAction", matchId: id, playerId: "c", actionType: "fold" });
    const match = lastMatch(s);
    expect(match.status).toBe("done");
    expect(match.winners).toEqual(["a"]);
    expect(match.endedBy).toBe("last-standing");
  });

  it("forbids folding when it would leave no players in", () => {
    const malformed = {
      id: "m",
      participants: players,
      rounds: [
        {
          index: 0,
          actions: [
            { id: "1", playerId: "a", type: "fold" as const, amount: 0, createdAt: "x" },
            { id: "2", playerId: "b", type: "fold" as const, amount: 0, createdAt: "x" },
            { id: "3", playerId: "c", type: "fold" as const, amount: 0, createdAt: "x" },
          ],
        },
      ],
      status: "active" as const,
      winners: [],
      createdAt: "x",
    };
    expectCode(() => deriveMatch(malformed, config), "fold-last-player");
  });
});

describe("winners and ledger", () => {
  function playedMatch(): Session {
    let s = startMatch(freshSession(["a", "b", "c"]), ["a", "b", "c"]);
    const id = lastMatch(s).id;
    s = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "a",
      actionType: "raise",
      amount: 5,
    });
    s = run(s, { type: "recordAction", matchId: id, playerId: "b", actionType: "call" });
    s = run(s, { type: "recordAction", matchId: id, playerId: "c", actionType: "call" });
    return s;
  }

  it("splits the pot evenly and gives remainder chips by chance, deterministically", () => {
    const base = playedMatch();
    const id = lastMatch(base).id;
    const s = run(base, { type: "selectWinners", matchId: id, winnerIds: ["a", "b"] });
    const match = lastMatch(s);
    const derived = deriveMatch(match, config);
    expect(derived.pot).toBe(15);
    const payouts = [derived.payouts.a, derived.payouts.b];
    expect(payouts.sort()).toEqual([7, 8]);
    expect(derived.remainderWinners).toHaveLength(1);

    const again = deriveMatch(match, config);
    expect(again.remainderWinners).toEqual(derived.remainderWinners);
  });

  it("keeps the session a zero-sum ledger once matches are settled", () => {
    let s = playedMatch();
    s = run(s, {
      type: "selectWinners",
      matchId: lastMatch(s).id,
      winnerIds: ["a", "b"],
    });
    const balances = sessionBalances(s, config);
    const total = Object.values(balances).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(0);
  });

  it("refuses to pick a folded player as a winner", () => {
    let s = startMatch(freshSession(["a", "b", "c"]), ["a", "b", "c"]);
    const id = lastMatch(s).id;
    s = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "a",
      actionType: "raise",
      amount: 10,
    });
    s = run(s, { type: "recordAction", matchId: id, playerId: "b", actionType: "fold" });
    s = run(s, { type: "recordAction", matchId: id, playerId: "c", actionType: "fold" });
    // Match auto-ended with a as last-standing winner; re-picking a folded player must fail.
    expectCode(
      () => run(s, { type: "selectWinners", matchId: id, winnerIds: ["b"] }),
      "winner-folded",
    );
  });
});

describe("history editing and session rules", () => {
  it("recomputes downstream totals when an action is edited", () => {
    let s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    const id = lastMatch(s).id;
    s = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "a",
      actionType: "raise",
      amount: 10,
    });
    s = run(s, { type: "recordAction", matchId: id, playerId: "b", actionType: "call" });
    s = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "a",
      actionType: "raise",
      amount: 20,
    });
    s = run(s, { type: "recordAction", matchId: id, playerId: "b", actionType: "call" });
    const before = deriveMatch(lastMatch(s), config);
    expect(before.contributions.a).toBe(30);
    const actionId = before.rounds[0]?.actions[0]?.id;
    if (!actionId) throw new Error("no action");
    const edited = run(s, {
      type: "editAction",
      matchId: id,
      actionId,
      actionType: "raise",
      amount: 5,
    });
    const after = deriveMatch(lastMatch(edited), config);
    expect(after.rounds[0]?.actions[0]?.roundTotal).toBe(5);
    expect(after.contributions.a).toBe(25);
  });

  it("clears winners for re-pick if a history edit makes a winner fold", () => {
    let s = startMatch(freshSession(["a", "b", "c"]), ["a", "b", "c"]);
    const id = lastMatch(s).id;
    s = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "a",
      actionType: "raise",
      amount: 10,
    });
    s = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "b",
      actionType: "raise",
      amount: 15,
    });
    s = run(s, { type: "recordAction", matchId: id, playerId: "c", actionType: "fold" });
    s = run(s, { type: "selectWinners", matchId: id, winnerIds: ["a", "b"] });
    expect(lastMatch(s).status).toBe("done");

    const firstActionId = deriveMatch(lastMatch(s), config).rounds[0]?.actions[0]?.id;
    if (!firstActionId) throw new Error("no action");
    const edited = run(s, {
      type: "editAction",
      matchId: id,
      actionId: firstActionId,
      actionType: "fold",
    });
    const match = lastMatch(edited);
    // "a" was a winner but now folds; winners are cleared and b wins last-standing.
    expect(match.winners).toEqual(["b"]);
    expect(match.endedBy).toBe("last-standing");
  });

  it("locks the roster while a match is in progress", () => {
    const s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    expectCode(
      () => run(s, { type: "setRoster", playerIds: ["a", "b", "c"] }),
      "match-in-progress",
    );
  });

  it("allows roster changes between matches and different match rosters", () => {
    let s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    const id = lastMatch(s).id;
    s = run(s, { type: "selectWinners", matchId: id, winnerIds: ["a"] });
    s = run(s, { type: "setRoster", playerIds: ["a", "b", "c"] });
    expect(s.players.map((p) => p.id)).toEqual(["a", "b", "c"]);
    s = startMatch(s, ["b", "c"]);
    expect(lastMatch(s).participants.map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("locks an ended session", () => {
    const s = run(freshSession(["a", "b"]), { type: "endSession" });
    expectCode(() => run(s, { type: "setRoster", playerIds: ["a"] }), "session-locked");
  });
});

describe("rng", () => {
  it("is deterministic for a given seed", () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});
