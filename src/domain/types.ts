export type PlayerId = string;

export interface ConfigPlayer {
  id: PlayerId;
  name: string;
}

export interface AppConfig {
  players: ConfigPlayer[];
  minRaise: number;
  maxBet: number;
  currencyLabel?: string;
}

export interface PlayerSnapshot {
  id: PlayerId;
  name: string;
}

export type SessionStatus = "active" | "paused" | "ended";

export type ActionType = "check" | "fold" | "call" | "raise";

/**
 * Stored (minimal) action. Only the user's intent is persisted so that edits
 * can be replayed deterministically. `amount` is:
 *  - raise: the additional chips the player pushes in
 *  - check / fold / call: 0 (call amount is resolved during replay)
 */
export interface Action {
  id: string;
  playerId: PlayerId;
  type: ActionType;
  amount: number;
  createdAt: string;
}

export interface Round {
  index: number;
  actions: Action[];
}

export type MatchEndReason = "winners" | "last-standing";

export interface Match {
  id: string;
  participants: PlayerSnapshot[];
  rounds: Round[];
  status: "active" | "done";
  winners: PlayerId[];
  /**
   * Seed used to distribute the non-divisible remainder chips. Stored so the
   * assignment is stable across edits and reloads.
   */
  remainderSeed?: number;
  createdAt: string;
  endedAt?: string;
  endedBy?: MatchEndReason;
}

export interface Session {
  id: string;
  name: string;
  status: SessionStatus;
  players: PlayerSnapshot[];
  matches: Match[];
  createdAt: string;
  updatedAt: string;
}

/** Derived (enriched) view of an action, computed by replaying a match. */
export interface DerivedAction extends Action {
  /** Chips actually added by this action. */
  added: number;
  roundTotal: number;
  matchTotal: number;
  allIn: boolean;
  /** True when the intended amount had to be clamped down to the max bet. */
  shortAllIn: boolean;
}

export interface DerivedRound {
  index: number;
  actions: DerivedAction[];
  /** Cumulative pot after this round. */
  potAtEnd: number;
}

export interface DerivedMatch {
  match: Match;
  rounds: DerivedRound[];
  pot: number;
  contributions: Record<PlayerId, number>;
  folded: PlayerId[];
  allIn: PlayerId[];
  active: PlayerId[];
  payouts: Record<PlayerId, number>;
  /** Winners who received an extra remainder chip, in assignment order. */
  remainderWinners: PlayerId[];
}
