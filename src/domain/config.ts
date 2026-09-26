import { DomainError } from "./errors";
import type { AppConfig } from "./types";

export function validateConfig(config: AppConfig): void {
  if (!Number.isInteger(config.minRaise) || config.minRaise < 1) {
    throw new DomainError("invalid-config", "minRaise must be a positive integer");
  }
  if (!Number.isInteger(config.maxBet) || config.maxBet < 1) {
    throw new DomainError("invalid-config", "maxBet must be a positive integer");
  }
  if (config.maxBet < config.minRaise) {
    throw new DomainError("invalid-config", "maxBet must be greater than or equal to minRaise");
  }
  const seen = new Set<string>();
  for (const player of config.players) {
    if (!player.id) throw new DomainError("invalid-config", "player id must not be empty");
    if (!player.name.trim())
      throw new DomainError("invalid-config", "player name must not be empty");
    if (seen.has(player.id))
      throw new DomainError("invalid-config", `duplicate player id: ${player.id}`);
    seen.add(player.id);
  }
}

export function resolvePlayers(
  config: AppConfig,
  ids: readonly string[],
): { id: string; name: string }[] {
  const byId = new Map(config.players.map((p) => [p.id, p]));
  return ids.map((id) => {
    const player = byId.get(id);
    if (!player) throw new DomainError("unknown-player", `unknown player: ${id}`);
    return { id: player.id, name: player.name };
  });
}
