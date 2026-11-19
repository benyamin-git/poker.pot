import { describe, expect, it } from "vitest";
import {
  type AppConfig,
  type Command,
  type Deps,
  DomainError,
  type Match,
  type PlayerSnapshot,
  type Session,
  applyCommand,
  createSession,
  deriveMatch,
  sessionBalances,
} from "../src/domain";

const players: PlayerSnapshot[] = [
  { id: "a", name: "Ali" },
  { id: "b", name: "Bo" },
  { id: "c", name: "Cy" },
  { id: "d", name: "Dee" },
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

function startMatch(session: Session, ids: string[], d = deps()): Session {
  return run(session, { type: "startMatch", participantIds: ids }, d);
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

describe("history editing commands", () => {
  it("deletes a single action and recomputes the pot", () => {
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
    const callId = deriveMatch(lastMatch(s), config).rounds[0]?.actions[1]?.id;
    if (!callId) throw new Error("no call action");

    const after = run(s, { type: "deleteAction", matchId: id, actionId: callId });
    const derived = deriveMatch(lastMatch(after), config);
    expect(derived.pot).toBe(10);
    expect(derived.contributions).toEqual({ a: 10, b: 0 });
    expect(lastMatch(after).status).toBe("active");
  });

  it("rejects deleting an unknown action", () => {
    const s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    expectCode(
      () => run(s, { type: "deleteAction", matchId: lastMatch(s).id, actionId: "nope" }),
      "unknown-action",
    );
  });

  it("deletes a whole round and reindexes the rest", () => {
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
    s = run(s, { type: "recordAction", matchId: id, playerId: "a", actionType: "check" });
    s = run(s, { type: "recordAction", matchId: id, playerId: "b", actionType: "check" });
    expect(lastMatch(s).rounds).toHaveLength(2);

    const after = run(s, { type: "deleteRound", matchId: id, roundIndex: 1 });
    const match = lastMatch(after);
    expect(match.rounds).toHaveLength(1);
    expect(match.rounds[0]?.index).toBe(0);
    expect(deriveMatch(match, config).contributions).toEqual({ a: 10, b: 10 });
  });

  it("rejects deleting an unknown round", () => {
    const s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    expectCode(
      () => run(s, { type: "deleteRound", matchId: lastMatch(s).id, roundIndex: 9 }),
      "unknown-round",
    );
  });

  it("deletes a match from the session", () => {
    let s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    const id = lastMatch(s).id;
    s = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "a",
      actionType: "raise",
      amount: 5,
    });
    s = run(s, { type: "recordAction", matchId: id, playerId: "b", actionType: "call" });
    s = run(s, { type: "selectWinners", matchId: id, winnerIds: ["a"] });
    const after = run(s, { type: "deleteMatch", matchId: id });
    expect(after.matches).toHaveLength(0);
    expectCode(() => run(s, { type: "deleteMatch", matchId: "nope" }), "unknown-match");
  });

  it("rejects editing an unknown action", () => {
    const s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    expectCode(
      () =>
        run(s, {
          type: "editAction",
          matchId: lastMatch(s).id,
          actionId: "nope",
          actionType: "fold",
        }),
      "unknown-action",
    );
  });
});

describe("session lifecycle commands", () => {
  it("renames a session and trims whitespace", () => {
    const s = run(freshSession(["a", "b"]), { type: "renameSession", name: "  Friday  " });
    expect(s.name).toBe("Friday");
    expectCode(() => run(s, { type: "renameSession", name: "   " }), "invalid-config");
  });

  it("pauses and resumes idempotently", () => {
    let s = run(freshSession(["a", "b"]), { type: "pauseSession" });
    expect(s.status).toBe("paused");
    s = run(s, { type: "pauseSession" });
    expect(s.status).toBe("paused");
    s = run(s, { type: "resumeSession" });
    expect(s.status).toBe("active");
    s = run(s, { type: "resumeSession" });
    expect(s.status).toBe("active");
  });

  it("blocks pausing while a match is in progress", () => {
    const s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    expectCode(() => run(s, { type: "pauseSession" }), "match-in-progress");
  });

  it("locks every command on an ended session", () => {
    const s = run(freshSession(["a", "b"]), { type: "endSession" });
    expect(s.status).toBe("ended");
    expectCode(() => run(s, { type: "renameSession", name: "later" }), "session-locked");
  });
});

describe("match guards and invalid actions", () => {
  it("requires at least two distinct participants", () => {
    const s = freshSession(["a", "b"]);
    expectCode(() => run(s, { type: "startMatch", participantIds: ["a"] }), "invalid-config");
    expectCode(() => run(s, { type: "startMatch", participantIds: ["a", "a"] }), "invalid-config");
  });

  it("rejects starting a match with an unknown player", () => {
    const s = freshSession(["a", "b"]);
    expectCode(() => run(s, { type: "startMatch", participantIds: ["a", "z"] }), "unknown-player");
  });

  it("rejects a command against an unknown match", () => {
    const s = freshSession(["a", "b"]);
    expectCode(
      () =>
        run(s, {
          type: "recordAction",
          matchId: "nope",
          playerId: "a",
          actionType: "fold",
        }),
      "unknown-match",
    );
  });

  it("rejects an action by a player who is not in the match", () => {
    const s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    expectCode(
      () =>
        run(s, {
          type: "recordAction",
          matchId: lastMatch(s).id,
          playerId: "c",
          actionType: "raise",
          amount: 5,
        }),
      "player-not-in-match",
    );
  });

  it("rejects actions on a finished match and after fold / all-in", () => {
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
    expectCode(
      () => run(s, { type: "recordAction", matchId: id, playerId: "b", actionType: "fold" }),
      "already-folded",
    );
    s = run(s, { type: "recordAction", matchId: id, playerId: "c", actionType: "fold" });
    expect(lastMatch(s).status).toBe("done");
    expectCode(
      () => run(s, { type: "recordAction", matchId: id, playerId: "a", actionType: "check" }),
      "match-not-active",
    );
  });

  it("rejects acting again once a player is all-in", () => {
    const s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    const id = lastMatch(s).id;
    const after = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "a",
      actionType: "raise",
      amount: 150,
    });
    expect(deriveMatch(lastMatch(after), config).allIn).toContain("a");
    expectCode(
      () => run(after, { type: "recordAction", matchId: id, playerId: "a", actionType: "check" }),
      "already-all-in",
    );
  });

  it("rejects selecting no winners", () => {
    const s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    expectCode(
      () => run(s, { type: "selectWinners", matchId: lastMatch(s).id, winnerIds: [] }),
      "winners-empty",
    );
  });
});

describe("simple match entry", () => {
  const simpleConfig: AppConfig = { ...config, simpleMode: true };

  function startSimple(session = freshSession(["a", "b", "c"])): Session {
    return applyCommand(
      session,
      simpleConfig,
      { type: "startMatch", participantIds: ["a", "b", "c"] },
      deps(),
    );
  }

  it("records a single winner's result and keeps the ledger zero-sum", () => {
    let s = startSimple();
    const match = lastMatch(s);
    expect(match.mode).toBe("simple");

    s = applyCommand(
      s,
      simpleConfig,
      {
        type: "recordSimpleResult",
        matchId: match.id,
        winnerIds: ["a"],
        paid: { b: 30, c: 20 },
        payouts: { a: 50 },
      },
      deps(),
    );

    const derived = deriveMatch(lastMatch(s), simpleConfig);
    expect(derived.rounds).toEqual([]);
    expect(derived.pot).toBe(50);
    expect(derived.contributions).toEqual({ a: 0, b: 30, c: 20 });
    expect(derived.payouts).toEqual({ a: 50, b: 0, c: 0 });
    expect(sessionBalances(s, simpleConfig)).toEqual({ a: 50, b: -30, c: -20 });
  });

  it("splits the winnings between multiple winners", () => {
    let s = startSimple();
    const match = lastMatch(s);

    s = applyCommand(
      s,
      simpleConfig,
      {
        type: "recordSimpleResult",
        matchId: match.id,
        winnerIds: ["a", "b"],
        paid: { c: 40 },
        payouts: { a: 30, b: 10 },
      },
      deps(),
    );

    expect(lastMatch(s).winners).toEqual(["a", "b"]);
    const derived = deriveMatch(lastMatch(s), simpleConfig);
    expect(derived.contributions).toEqual({ a: 0, b: 0, c: 40 });
    expect(derived.payouts).toEqual({ a: 30, b: 10, c: 0 });
    expect(sessionBalances(s, simpleConfig)).toEqual({ a: 30, b: 10, c: -40 });
  });

  it("reads a legacy single-winner gross payout", () => {
    const match: Match = {
      id: "legacy",
      participants: players.slice(0, 3).map((player) => ({ ...player })),
      rounds: [],
      mode: "simple",
      status: "done",
      winners: ["a"],
      simple: { paid: { b: 30, c: 20 }, payout: 80 },
      createdAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:00.000Z",
      endedBy: "winners",
    };
    const derived = deriveMatch(match, simpleConfig);
    expect(derived.pot).toBe(80);
    expect(derived.contributions).toEqual({ a: 30, b: 30, c: 20 });
    expect(derived.payouts).toEqual({ a: 80, b: 0, c: 0 });
  });

  it("rejects winnings that do not match the losers' total", () => {
    const s = startSimple();
    expectCode(
      () =>
        applyCommand(
          s,
          simpleConfig,
          {
            type: "recordSimpleResult",
            matchId: lastMatch(s).id,
            winnerIds: ["a", "b"],
            paid: { c: 40 },
            payouts: { a: 20, b: 10 },
          },
          deps(),
        ),
      "invalid-amount",
    );
  });

  it("rejects betting actions on a simple match", () => {
    const s = startSimple();
    expectCode(
      () =>
        applyCommand(
          s,
          simpleConfig,
          {
            type: "recordAction",
            matchId: lastMatch(s).id,
            playerId: "a",
            actionType: "raise",
            amount: 5,
          },
          deps(),
        ),
      "action-not-allowed",
    );
  });

  it("leaves detailed matches untouched when the setting is off", () => {
    const s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    expect(lastMatch(s).mode).toBeUndefined();
  });
});

describe("all-in and payouts", () => {
  it("keeps an all-in player eligible to win the pot", () => {
    let s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    const id = lastMatch(s).id;
    s = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "a",
      actionType: "raise",
      amount: 150,
    });
    s = run(s, { type: "recordAction", matchId: id, playerId: "b", actionType: "call" });
    const derived = deriveMatch(lastMatch(s), config);
    expect(derived.pot).toBe(200);
    expect(derived.active).toHaveLength(0);
    s = run(s, { type: "selectWinners", matchId: id, winnerIds: ["a"] });
    expect(deriveMatch(lastMatch(s), config).payouts.a).toBe(200);
  });

  it("assigns multiple remainder chips and keeps the assignment stable", () => {
    // Four players, all at 10 after round 1; in round 2 "d" folds having
    // contributed 5, so the pot is 35 and three winners split 11 + two extras.
    let s = startMatch(freshSession(["a", "b", "c", "d"]), ["a", "b", "c", "d"]);
    const id = lastMatch(s).id;
    for (const playerId of ["a", "b", "c", "d"]) {
      s = run(s, {
        type: "recordAction",
        matchId: id,
        playerId,
        actionType: playerId === "a" ? "raise" : "call",
        amount: playerId === "a" ? 5 : 0,
      });
    }
    s = run(s, {
      type: "recordAction",
      matchId: id,
      playerId: "a",
      actionType: "raise",
      amount: 5,
    });
    s = run(s, { type: "recordAction", matchId: id, playerId: "b", actionType: "call" });
    s = run(s, { type: "recordAction", matchId: id, playerId: "c", actionType: "call" });
    s = run(s, { type: "recordAction", matchId: id, playerId: "d", actionType: "fold" });
    s = run(s, {
      type: "selectWinners",
      matchId: id,
      winnerIds: ["a", "b", "c"],
    });
    const match = lastMatch(s);
    const derived = deriveMatch(match, config);
    expect(derived.pot).toBe(35);
    expect(derived.remainderWinners).toHaveLength(2);
    const payouts = [derived.payouts.a, derived.payouts.b, derived.payouts.c].sort();
    expect(payouts).toEqual([11, 12, 12]);
    expect(deriveMatch(match, config).remainderWinners).toEqual(derived.remainderWinners);
  });

  it("tracks balances across multiple matches as a zero-sum ledger", () => {
    let s = startMatch(freshSession(["a", "b"]), ["a", "b"]);
    const first = lastMatch(s).id;
    s = run(s, {
      type: "recordAction",
      matchId: first,
      playerId: "a",
      actionType: "raise",
      amount: 5,
    });
    s = run(s, { type: "recordAction", matchId: first, playerId: "b", actionType: "call" });
    s = run(s, { type: "selectWinners", matchId: first, winnerIds: ["a"] });

    s = startMatch(s, ["a", "b"]);
    const second = lastMatch(s).id;
    s = run(s, {
      type: "recordAction",
      matchId: second,
      playerId: "a",
      actionType: "raise",
      amount: 20,
    });
    s = run(s, { type: "recordAction", matchId: second, playerId: "b", actionType: "call" });
    s = run(s, { type: "selectWinners", matchId: second, winnerIds: ["b"] });

    const balances = sessionBalances(s, config);
    expect(balances).toEqual({ a: -15, b: 15 });
    expect(Object.values(balances).reduce((sum, n) => sum + n, 0)).toBe(0);
  });
});
