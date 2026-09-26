import { resolvePlayers } from "./config";
import { DomainError } from "./errors";
import type { Deps } from "./match";
import {
  createMatch,
  deleteAction,
  deleteRound,
  editAction,
  recordAction,
  selectWinners,
} from "./match";
import type { AppConfig, PlayerId, PlayerSnapshot, Session } from "./types";

export type Command =
  | { type: "startMatch"; participantIds: PlayerId[] }
  | {
      type: "recordAction";
      matchId: string;
      playerId: PlayerId;
      actionType: "check" | "fold" | "call" | "raise";
      amount?: number;
    }
  | {
      type: "editAction";
      matchId: string;
      actionId: string;
      actionType: "check" | "fold" | "call" | "raise";
      amount?: number;
    }
  | { type: "deleteAction"; matchId: string; actionId: string }
  | { type: "deleteRound"; matchId: string; roundIndex: number }
  | { type: "deleteMatch"; matchId: string }
  | { type: "selectWinners"; matchId: string; winnerIds: PlayerId[] }
  | { type: "setRoster"; playerIds: PlayerId[] }
  | { type: "renameSession"; name: string }
  | { type: "pauseSession" }
  | { type: "resumeSession" }
  | { type: "endSession" };

export function createSession(
  id: string,
  name: string,
  players: PlayerSnapshot[],
  now: string,
): Session {
  return {
    id,
    name,
    status: "active",
    players: players.map((p) => ({ ...p })),
    matches: [],
    createdAt: now,
    updatedAt: now,
  };
}

function requireNoActiveMatch(session: Session): void {
  if (session.matches.some((m) => m.status === "active")) {
    throw new DomainError("match-in-progress", "finish the current match first");
  }
}

function findMatch(session: Session, matchId: string) {
  const match = session.matches.find((m) => m.id === matchId);
  if (!match) throw new DomainError("unknown-match", `unknown match: ${matchId}`);
  return match;
}

export function applyCommand(
  session: Session,
  config: AppConfig,
  command: Command,
  deps: Deps,
): Session {
  if (session.status === "ended") {
    throw new DomainError("session-locked", "this session has ended and can no longer change");
  }

  const next: Session = {
    ...session,
    players: session.players.map((p) => ({ ...p })),
    matches: session.matches.map((m) => ({
      ...m,
      participants: m.participants.map((p) => ({ ...p })),
      winners: [...m.winners],
      rounds: m.rounds.map((r) => ({ index: r.index, actions: r.actions.map((a) => ({ ...a })) })),
    })),
    updatedAt: deps.now(),
  };

  switch (command.type) {
    case "startMatch": {
      requireNoActiveMatch(next);
      const unique = [...new Set(command.participantIds)];
      if (unique.length < 2) {
        throw new DomainError("invalid-config", "a match needs at least two players");
      }
      const participants = resolvePlayers(config, unique);
      next.matches.push(createMatch(participants, deps.newId(), deps.now()));
      break;
    }
    case "recordAction": {
      const match = findMatch(next, command.matchId);
      const index = next.matches.indexOf(match);
      next.matches[index] = recordAction(
        match,
        config,
        {
          playerId: command.playerId,
          type: command.actionType,
          amount: command.amount ?? 0,
        },
        deps,
      );
      break;
    }
    case "editAction": {
      const match = findMatch(next, command.matchId);
      const index = next.matches.indexOf(match);
      next.matches[index] = editAction(
        match,
        config,
        command.actionId,
        { type: command.actionType, amount: command.amount ?? 0 },
        deps,
      );
      break;
    }
    case "deleteAction": {
      const match = findMatch(next, command.matchId);
      const index = next.matches.indexOf(match);
      next.matches[index] = deleteAction(match, config, command.actionId, deps);
      break;
    }
    case "deleteRound": {
      const match = findMatch(next, command.matchId);
      const index = next.matches.indexOf(match);
      next.matches[index] = deleteRound(match, config, command.roundIndex, deps);
      break;
    }
    case "deleteMatch": {
      findMatch(next, command.matchId);
      next.matches = next.matches.filter((m) => m.id !== command.matchId);
      break;
    }
    case "selectWinners": {
      const match = findMatch(next, command.matchId);
      const index = next.matches.indexOf(match);
      next.matches[index] = selectWinners(match, config, command.winnerIds, deps);
      break;
    }
    case "setRoster": {
      requireNoActiveMatch(next);
      const unique = [...new Set(command.playerIds)];
      if (unique.length === 0) {
        throw new DomainError("roster-empty", "the session needs at least one player");
      }
      next.players = resolvePlayers(config, unique);
      break;
    }
    case "renameSession": {
      const name = command.name.trim();
      if (!name) throw new DomainError("invalid-config", "session name must not be empty");
      next.name = name;
      break;
    }
    case "pauseSession": {
      if (next.status === "paused") break;
      requireNoActiveMatch(next);
      next.status = "paused";
      break;
    }
    case "resumeSession": {
      if (next.status === "active") break;
      next.status = "active";
      break;
    }
    case "endSession": {
      next.status = "ended";
      break;
    }
    default: {
      throw new DomainError("action-not-allowed", "unknown command");
    }
  }

  return next;
}
