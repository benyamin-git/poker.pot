export type DomainErrorCode =
  | "unknown-player"
  | "unknown-match"
  | "unknown-action"
  | "unknown-round"
  | "match-not-active"
  | "session-locked"
  | "match-in-progress"
  | "roster-empty"
  | "player-not-in-match"
  | "already-folded"
  | "already-all-in"
  | "already-acted"
  | "action-not-allowed"
  | "invalid-check"
  | "invalid-call"
  | "raise-too-small"
  | "invalid-amount"
  | "fold-last-player"
  | "winners-empty"
  | "winner-folded"
  | "invalid-config"
  | "no-active-match";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
