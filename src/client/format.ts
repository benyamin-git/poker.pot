import type { AppConfig, Session } from "../domain";

export function playerName(id: string, session: Session | null, config: AppConfig | null): string {
  const fromSession =
    session?.players.find((p) => p.id === id) ??
    session?.matches.flatMap((m) => m.participants).find((p) => p.id === id);
  if (fromSession) return fromSession.name;
  const fromConfig = config?.players.find((p) => p.id === id);
  return fromConfig?.name ?? id;
}

export function formatAmount(value: number, currency?: string): string {
  const text = String(value);
  return currency ? `${text} ${currency}` : text;
}

export function formatSigned(value: number, currency?: string): string {
  const text = value > 0 ? `+${value}` : String(value);
  return currency ? `${text} ${currency}` : text;
}

export function signedTone(value: number): "positive" | "negative" | "" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "";
}
