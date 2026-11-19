import { DomainError } from "./errors";
import { mulberry32, pickDistinct } from "./rng";
import type {
  Action,
  AppConfig,
  DerivedAction,
  DerivedMatch,
  DerivedRound,
  Match,
  PlayerId,
  PlayerSnapshot,
  SimpleResult,
} from "./types";

function cloneMatch(match: Match): Match {
  return {
    ...match,
    participants: match.participants.map((p) => ({ ...p })),
    winners: [...match.winners],
    rounds: match.rounds.map((round) => ({
      index: round.index,
      actions: round.actions.map((a) => ({ ...a })),
    })),
  };
}

/** Whole-chip split: a base share plus the leftover chips. */
export function splitPot(total: number, count: number): { base: number; remainder: number } {
  if (count <= 0) return { base: 0, remainder: 0 };
  const base = Math.floor(total / count);
  return { base, remainder: total - base * count };
}

/** A match reopened for play, with all end-state fields removed. */
function reopenedMatch(match: Match): Match {
  return {
    id: match.id,
    participants: match.participants,
    rounds: match.rounds,
    status: "active",
    winners: [],
    createdAt: match.createdAt,
  };
}

/** Replay every action and derive the full match state. Throws on invalid data. */
export function deriveMatch(match: Match, config: AppConfig): DerivedMatch {
  if (match.simple) return deriveSimpleMatch(match, match.simple);

  const participantIds = match.participants.map((p) => p.id);
  const participantSet = new Set(participantIds);
  const folded = new Set<PlayerId>();
  const allIn = new Set<PlayerId>();
  const contributions: Record<PlayerId, number> = {};
  for (const id of participantIds) contributions[id] = 0;

  const rounds: DerivedRound[] = [];
  let pot = 0;

  for (const round of match.rounds) {
    let roundHigh = 0;
    const roundTotals: Record<PlayerId, number> = {};
    const derivedActions: DerivedAction[] = [];

    for (const action of round.actions) {
      if (!participantSet.has(action.playerId)) {
        throw new DomainError("player-not-in-match", `player not in match: ${action.playerId}`);
      }
      if (folded.has(action.playerId)) {
        throw new DomainError("already-folded", `player already folded: ${action.playerId}`);
      }
      if (allIn.has(action.playerId)) {
        throw new DomainError("already-all-in", `player already all-in: ${action.playerId}`);
      }

      const currentRound = roundTotals[action.playerId] ?? 0;
      const matchTotal = contributions[action.playerId] ?? 0;
      const cap = config.maxBet - matchTotal;
      let added = 0;
      let shortAllIn = false;

      switch (action.type) {
        case "check": {
          if (action.amount !== 0) {
            throw new DomainError("invalid-amount", "check must not carry an amount");
          }
          if (round.index === 0) {
            throw new DomainError("action-not-allowed", "preflop: fold or raise, no checking");
          }
          if (roundHigh > 0) {
            throw new DomainError("invalid-check", "cannot check when there is a bet to call");
          }
          break;
        }
        case "fold": {
          if (action.amount !== 0) {
            throw new DomainError("invalid-amount", "fold must not carry an amount");
          }
          const nonFoldedNow = participantIds.filter((id) => !folded.has(id)).length;
          if (nonFoldedNow - 1 < 1) {
            throw new DomainError("fold-last-player", "cannot fold: you are the last player in");
          }
          folded.add(action.playerId);
          break;
        }
        case "call": {
          if (action.amount !== 0) {
            throw new DomainError("invalid-amount", "call must not carry an amount");
          }
          if (roundHigh === 0) {
            throw new DomainError("invalid-call", "nothing to call");
          }
          const desired = roundHigh - currentRound;
          if (desired <= 0) {
            throw new DomainError("invalid-call", "you have already matched the current bet");
          }
          added = Math.min(desired, cap);
          shortAllIn = added < desired;
          break;
        }
        case "raise": {
          if (!Number.isInteger(action.amount) || action.amount <= 0) {
            throw new DomainError("invalid-amount", "raise amount must be a positive integer");
          }
          const desired = action.amount;
          added = Math.min(desired, cap);
          shortAllIn = added < desired;
          const finalTotal = currentRound + added;
          const mustReach = roundHigh + config.minRaise;
          if (!shortAllIn && finalTotal < mustReach) {
            throw new DomainError(
              "raise-too-small",
              `raise must reach at least ${mustReach} this round`,
            );
          }
          if (added <= 0) {
            throw new DomainError("invalid-amount", "raise must add at least one chip");
          }
          break;
        }
        default: {
          throw new DomainError("action-not-allowed", "unknown action type");
        }
      }

      roundTotals[action.playerId] = currentRound + added;
      contributions[action.playerId] = matchTotal + added;
      pot += added;
      if ((contributions[action.playerId] ?? 0) >= config.maxBet) allIn.add(action.playerId);
      roundHigh = Math.max(roundHigh, roundTotals[action.playerId] ?? 0);

      derivedActions.push({
        ...action,
        added,
        roundTotal: roundTotals[action.playerId] ?? 0,
        matchTotal: contributions[action.playerId] ?? 0,
        allIn: allIn.has(action.playerId),
        shortAllIn,
      });
    }

    rounds.push({ index: round.index, actions: derivedActions, potAtEnd: pot });
  }

  const payouts: Record<PlayerId, number> = {};
  for (const id of participantIds) payouts[id] = 0;
  let remainderWinners: PlayerId[] = [];

  if (match.status === "done" && match.winners.length > 0 && pot > 0) {
    for (const winner of match.winners) {
      if (!participantSet.has(winner)) {
        throw new DomainError("unknown-player", `winner not in match: ${winner}`);
      }
      if (folded.has(winner)) {
        throw new DomainError("winner-folded", `a selected winner has folded: ${winner}`);
      }
    }
    const n = match.winners.length;
    const { base, remainder } = splitPot(pot, n);
    for (const winner of match.winners) payouts[winner] = base;
    if (remainder > 0) {
      const rng = mulberry32(match.remainderSeed ?? 1);
      remainderWinners = pickDistinct(match.winners, remainder, rng);
      for (const winner of remainderWinners) payouts[winner] = (payouts[winner] ?? 0) + 1;
    }
  }

  const active = participantIds.filter((id) => !folded.has(id) && !allIn.has(id));

  return {
    match,
    rounds,
    pot,
    contributions,
    folded: [...folded],
    allIn: [...allIn],
    active,
    payouts,
    remainderWinners,
  };
}

/**
 * A simple match has no rounds. New results store each winner's net winnings;
 * the legacy shape stored one gross payout, where the excess over the losers'
 * total was the winner's own stake.
 */
function deriveSimpleMatch(match: Match, result: SimpleResult): DerivedMatch {
  const winners = [...new Set(match.winners)];
  const participants = new Set(match.participants.map((p) => p.id));
  if (winners.length === 0) {
    throw new DomainError("winners-empty", "a simple match needs at least one winner");
  }
  for (const winner of winners) {
    if (!participants.has(winner)) {
      throw new DomainError("unknown-player", `winner not in match: ${winner}`);
    }
  }

  const contributions: Record<PlayerId, number> = {};
  const payouts: Record<PlayerId, number> = {};
  for (const player of match.participants) {
    contributions[player.id] = 0;
    payouts[player.id] = 0;
  }

  let paidByLosers = 0;
  let paidToWinners = 0;

  if (result.payouts) {
    for (const player of match.participants) {
      const isWinner = winners.includes(player.id);
      const amount = isWinner ? (result.payouts[player.id] ?? 0) : (result.paid[player.id] ?? 0);
      if (!Number.isInteger(amount) || amount < 0) {
        throw new DomainError(
          "invalid-amount",
          `invalid ${isWinner ? "payout" : "payment"} for ${player.id}`,
        );
      }
      if (isWinner) {
        payouts[player.id] = amount;
        paidToWinners += amount;
      } else {
        contributions[player.id] = amount;
        paidByLosers += amount;
      }
    }
    if (paidToWinners !== paidByLosers) {
      throw new DomainError("invalid-amount", "winnings must equal the losers' total");
    }
  } else {
    if (winners.length !== 1) {
      throw new DomainError("winners-empty", "a simple match needs exactly one winner");
    }
    const winner = winners[0] as PlayerId;
    for (const player of match.participants) {
      if (player.id === winner) continue;
      const paid = result.paid[player.id] ?? 0;
      if (!Number.isInteger(paid) || paid < 0) {
        throw new DomainError("invalid-amount", `invalid payment for ${player.id}`);
      }
      contributions[player.id] = paid;
      paidByLosers += paid;
    }
    const payout = result.payout;
    if (payout === undefined || !Number.isInteger(payout) || payout <= 0 || payout < paidByLosers) {
      throw new DomainError("invalid-amount", "the winner must be paid at least the losers' total");
    }
    contributions[winner] = payout - paidByLosers;
    payouts[winner] = payout;
    paidToWinners = payout;
  }

  return {
    match,
    rounds: [],
    pot: paidToWinners,
    contributions,
    folded: [],
    allIn: [],
    active: [],
    payouts,
    remainderWinners: [],
  };
}

/**
 * A round is complete when every active player (not folded, not all-in) has
 * acted and matched the highest bet of the round. A raise therefore reopens
 * the action for anyone who already acted but is now behind.
 */
export function isRoundComplete(derived: DerivedMatch): boolean {
  const last = derived.rounds[derived.rounds.length - 1];
  if (!last) return false;
  const acted = new Set<PlayerId>();
  const totals: Record<PlayerId, number> = {};
  let roundHigh = 0;
  for (const action of last.actions) {
    acted.add(action.playerId);
    totals[action.playerId] = action.roundTotal;
    roundHigh = Math.max(roundHigh, action.roundTotal);
  }
  return derived.active.every((id) => acted.has(id) && (totals[id] ?? 0) >= roundHigh);
}

/** Index the next action should be recorded against. -1 when the match is done. */
export function currentRoundIndex(derived: DerivedMatch): number {
  if (derived.match.status === "done") return -1;
  const last = derived.rounds[derived.rounds.length - 1];
  if (!last) return 0;
  return isRoundComplete(derived) ? last.index + 1 : last.index;
}

function settle(match: Match, derived: DerivedMatch, now: string): Match {
  const nonFolded = match.participants.filter((p) => !derived.folded.includes(p.id));
  if (match.status === "active" && nonFolded.length === 1) {
    const winner = nonFolded[0];
    if (winner) {
      return {
        ...match,
        status: "done",
        winners: [winner.id],
        endedBy: "last-standing",
        endedAt: now,
      };
    }
  }
  if (match.status === "done" && match.endedBy === "last-standing" && nonFolded.length > 1) {
    return reopenedMatch(match);
  }
  return match;
}

export interface Deps {
  now: () => string;
  newId: () => string;
  random: () => number;
}

/**
 * Re-derive a structurally changed match. If a history edit invalidates a
 * previously chosen winner, the winners are cleared and the match reopens so
 * the group can pick again (rather than corrupting the ledger).
 */
export function finalizeMatch(match: Match, config: AppConfig, now: string): Match {
  try {
    const derived = deriveMatch(match, config);
    return settle(match, derived, now);
  } catch (error) {
    if (error instanceof DomainError && error.code === "winner-folded") {
      const reopened = reopenedMatch(match);
      const derived = deriveMatch(reopened, config);
      return settle(reopened, derived, now);
    }
    throw error;
  }
}

export function createMatch(
  participants: PlayerSnapshot[],
  id: string,
  now: string,
  mode?: Match["mode"],
): Match {
  return {
    id,
    participants: participants.map((p) => ({ ...p })),
    rounds: [],
    status: "active",
    winners: [],
    createdAt: now,
    ...(mode ? { mode } : {}),
  };
}

export interface ActionInput {
  playerId: PlayerId;
  type: Action["type"];
  amount: number;
}

export function recordAction(
  match: Match,
  config: AppConfig,
  input: ActionInput,
  deps: Deps,
): Match {
  if (match.mode === "simple") {
    throw new DomainError("action-not-allowed", "simple matches record only the final result");
  }
  const derived = deriveMatch(match, config);
  if (derived.match.status === "done") {
    throw new DomainError("match-not-active", "match is already finished");
  }
  const nextIndex = currentRoundIndex(derived);
  const candidate = cloneMatch(match);
  if (nextIndex >= candidate.rounds.length) {
    candidate.rounds.push({ index: nextIndex, actions: [] });
  }
  const round = candidate.rounds[candidate.rounds.length - 1];
  if (!round) throw new DomainError("unknown-round", "could not open a betting round");
  const action: Action = {
    id: deps.newId(),
    playerId: input.playerId,
    type: input.type,
    amount: input.amount,
    createdAt: deps.now(),
  };
  round.actions.push(action);
  return finalizeMatch(candidate, config, deps.now());
}

export function editAction(
  match: Match,
  config: AppConfig,
  actionId: string,
  patch: { type: Action["type"]; amount: number },
  deps: Deps,
): Match {
  const candidate = cloneMatch(match);
  let found = false;
  for (const round of candidate.rounds) {
    for (const action of round.actions) {
      if (action.id === actionId) {
        action.type = patch.type;
        action.amount = patch.amount;
        found = true;
        break;
      }
    }
    if (found) break;
  }
  if (!found) throw new DomainError("unknown-action", `unknown action: ${actionId}`);
  return finalizeMatch(candidate, config, deps.now());
}

export function deleteAction(match: Match, config: AppConfig, actionId: string, deps: Deps): Match {
  const candidate = cloneMatch(match);
  let found = false;
  candidate.rounds = candidate.rounds
    .map((round) => {
      const actions = round.actions.filter((action) => {
        if (!found && action.id === actionId) {
          found = true;
          return false;
        }
        return true;
      });
      return { index: round.index, actions };
    })
    .filter((round) => round.actions.length > 0)
    .map((round, index) => ({ index, actions: round.actions }));
  if (!found) throw new DomainError("unknown-action", `unknown action: ${actionId}`);
  return finalizeMatch(candidate, config, deps.now());
}

export function deleteRound(
  match: Match,
  config: AppConfig,
  roundIndex: number,
  deps: Deps,
): Match {
  const candidate = cloneMatch(match);
  const before = candidate.rounds.length;
  candidate.rounds = candidate.rounds
    .filter((round) => round.index !== roundIndex)
    .map((round, index) => ({ index, actions: round.actions }));
  if (candidate.rounds.length === before) {
    throw new DomainError("unknown-round", `unknown round: ${roundIndex}`);
  }
  return finalizeMatch(candidate, config, deps.now());
}

export function selectWinners(
  match: Match,
  config: AppConfig,
  winnerIds: PlayerId[],
  deps: Deps,
): Match {
  if (match.mode === "simple") {
    throw new DomainError(
      "action-not-allowed",
      "record the final result of a simple match instead",
    );
  }
  const derived = deriveMatch(match, config);
  const nonFolded = new Set(
    match.participants.filter((p) => !derived.folded.includes(p.id)).map((p) => p.id),
  );
  const unique = [...new Set(winnerIds)];
  if (unique.length === 0) {
    throw new DomainError("winners-empty", "choose at least one winner");
  }
  for (const id of unique) {
    if (!nonFolded.has(id)) {
      throw new DomainError("winner-folded", `cannot pick a folded player as winner: ${id}`);
    }
  }
  const seed = Math.floor(deps.random() * 0xffffffff);
  const done: Match = {
    ...match,
    status: "done",
    winners: unique,
    remainderSeed: seed,
    endedBy: "winners",
    endedAt: deps.now(),
  };
  return finalizeMatch(done, config, deps.now());
}

export interface SimpleResultInput {
  winnerIds: PlayerId[];
  paid: Record<PlayerId, number>;
  payouts: Record<PlayerId, number>;
}

/** Finish a simple match from the money that changed hands. */
export function recordSimpleResult(match: Match, input: SimpleResultInput, deps: Deps): Match {
  if (match.mode !== "simple") {
    throw new DomainError("action-not-allowed", "this match records betting actions");
  }
  const winners = [...new Set(input.winnerIds)];
  if (winners.length === 0) {
    throw new DomainError("winners-empty", "choose at least one winner");
  }
  const participantIds = new Set(match.participants.map((p) => p.id));
  for (const winner of winners) {
    if (!participantIds.has(winner)) {
      throw new DomainError("unknown-player", `winner not in match: ${winner}`);
    }
  }

  const paid: Record<PlayerId, number> = {};
  let totalPaid = 0;
  for (const player of match.participants) {
    if (winners.includes(player.id)) continue;
    const amount = input.paid[player.id] ?? 0;
    if (!Number.isInteger(amount) || amount < 0) {
      throw new DomainError("invalid-amount", `invalid payment for ${player.id}`);
    }
    paid[player.id] = amount;
    totalPaid += amount;
  }

  const payouts: Record<PlayerId, number> = {};
  let totalPayout = 0;
  for (const winner of winners) {
    const amount = input.payouts[winner] ?? 0;
    if (!Number.isInteger(amount) || amount < 0) {
      throw new DomainError("invalid-amount", `invalid payout for ${winner}`);
    }
    payouts[winner] = amount;
    totalPayout += amount;
  }

  if (totalPaid <= 0) {
    throw new DomainError("invalid-amount", "the losers must have paid something");
  }
  if (totalPayout !== totalPaid) {
    throw new DomainError("invalid-amount", "winnings must equal the losers' total");
  }

  return {
    ...match,
    status: "done",
    winners,
    simple: { paid, payouts },
    endedBy: "winners",
    endedAt: deps.now(),
  };
}

export function sessionBalances(
  session: { matches: Match[] },
  config: AppConfig,
): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const match of session.matches) {
    const derived = deriveMatch(match, config);
    for (const participant of match.participants) {
      balances[participant.id] = balances[participant.id] ?? 0;
    }
    for (const [id, contribution] of Object.entries(derived.contributions)) {
      balances[id] = (balances[id] ?? 0) - contribution;
    }
    if (match.status === "done") {
      for (const [id, payout] of Object.entries(derived.payouts)) {
        balances[id] = (balances[id] ?? 0) + payout;
      }
    }
  }
  return balances;
}

export { cloneMatch };
