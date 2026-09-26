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
  currentRoundIndex,
  deriveMatch,
  sessionBalances,
} from "../src/domain";
import { mulberry32 } from "../src/domain/rng";

const players: PlayerSnapshot[] = [
  { id: "a", name: "Ali" },
  { id: "b", name: "Bo" },
  { id: "c", name: "Cy" },
  { id: "d", name: "Dee" },
];

const config: AppConfig = { players, minRaise: 5, maxBet: 40 };

interface RoundInfo {
  roundHigh: number;
  totals: Record<string, number>;
}

function roundInfo(derived: ReturnType<typeof deriveMatch>): RoundInfo {
  const last = derived.rounds[derived.rounds.length - 1];
  if (!last || currentRoundIndex(derived) !== last.index) return { roundHigh: 0, totals: {} };
  const totals: Record<string, number> = {};
  let roundHigh = 0;
  for (const action of last.actions) {
    totals[action.playerId] = action.roundTotal;
    roundHigh = Math.max(roundHigh, action.roundTotal);
  }
  return { roundHigh, totals };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = copy[i];
    const b = copy[j];
    if (a !== undefined && b !== undefined) {
      copy[i] = b;
      copy[j] = a;
    }
  }
  return copy;
}

/** Play one seeded, fully-valid match and settle it, returning the session. */
function playSeededMatch(seed: number, playerCount: number): Session {
  const random = mulberry32(seed);
  const roster = players.slice(0, playerCount);
  const deps: Deps = {
    now: () => "2026-01-01T00:00:00.000Z",
    newId: (() => {
      let n = 0;
      return () => `id${seed}-${++n}`;
    })(),
    random,
  };

  let session = createSession(`s${seed}`, "Invariant", roster, "2026-01-01T00:00:00.000Z");
  session = applyCommand(
    session,
    config,
    { type: "startMatch", participantIds: roster.map((p) => p.id) },
    deps,
  );
  const matchId = session.matches[0]?.id;
  if (!matchId) throw new Error("no match");

  const maxActions = 40;
  for (let step = 0; step < maxActions; step++) {
    const match = session.matches[0];
    if (!match) throw new Error("no match");
    const derived = deriveMatch(match, config);
    if (derived.match.status === "done") break;

    const info = roundInfo(derived);
    const ids = shuffle(
      match.participants.map((p) => p.id),
      random,
    );
    let acted = false;

    for (const playerId of ids) {
      const matchTotal = derived.contributions[playerId] ?? 0;
      const remaining = config.maxBet - matchTotal;
      const playerRound = info.totals[playerId] ?? 0;
      const minRaiseBy = Math.max(1, info.roundHigh + config.minRaise - playerRound);

      const candidates: Command[] = [];
      if (remaining > 0) {
        candidates.push({
          type: "recordAction",
          matchId,
          playerId,
          actionType: "raise",
          amount: Math.min(minRaiseBy, remaining),
        });
      }
      candidates.push(
        { type: "recordAction", matchId, playerId, actionType: "call" },
        { type: "recordAction", matchId, playerId, actionType: "check" },
        { type: "recordAction", matchId, playerId, actionType: "fold" },
      );

      let applied = false;
      for (const candidate of shuffle(candidates, random)) {
        try {
          session = applyCommand(session, config, candidate, deps);
          applied = true;
          break;
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
        }
      }
      if (applied) {
        acted = true;
        break;
      }
    }

    if (!acted) break;
  }

  const match = session.matches[0];
  if (!match) throw new Error("no match");
  const derived = deriveMatch(match, config);
  if (derived.match.status !== "done" && derived.pot > 0) {
    const nonFolded = match.participants
      .filter((p) => !derived.folded.includes(p.id))
      .map((p) => p.id);
    const winnerCount = 1 + Math.floor(random() * nonFolded.length);
    const winners = shuffle(nonFolded, random).slice(0, winnerCount);
    session = applyCommand(
      session,
      config,
      { type: "selectWinners", matchId, winnerIds: winners },
      deps,
    );
  }

  return session;
}

describe("ledger invariants under randomized valid play", () => {
  for (const playerCount of [2, 3, 4]) {
    for (let seed = 1; seed <= 25; seed++) {
      it(`stays zero-sum (players=${playerCount}, seed=${seed})`, () => {
        const session = playSeededMatch(seed, playerCount);
        const balances = sessionBalances(session, config);
        const total = Object.values(balances).reduce((sum, n) => sum + n, 0);
        expect(total).toBe(0);

        const match = session.matches[0];
        if (!match) throw new Error("no match");
        const derived = deriveMatch(match, config);
        for (const player of match.participants) {
          const expected =
            (derived.payouts[player.id] ?? 0) - (derived.contributions[player.id] ?? 0);
          expect(balances[player.id]).toBe(expected);
        }
        if (derived.match.status === "done") {
          expect(derived.pot).toBeGreaterThanOrEqual(0);
        }
      });
    }
  }
});
