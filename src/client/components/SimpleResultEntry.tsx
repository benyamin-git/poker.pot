import { useState } from "react";
import { type PlayerSnapshot, splitPot } from "../../domain";
import { PlayerPicker } from "./PlayerPicker";
import { Button, Card } from "./ui";

export interface SimpleResultValue {
  winnerIds: string[];
  paid: Record<string, number>;
  payouts: Record<string, number>;
}

function toAmount(value: string): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function SimpleResultEntry({
  participants,
  currency,
  initial,
  onSubmit,
}: {
  participants: PlayerSnapshot[];
  currency?: string | undefined;
  initial?: SimpleResultValue | undefined;
  onSubmit: (value: SimpleResultValue) => Promise<void>;
}) {
  const [winnerIds, setWinnerIds] = useState<string[]>(initial?.winnerIds ?? []);
  const [paid, setPaid] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(initial?.paid ?? {}).map(([id, amount]) => [id, String(amount)]),
    ),
  );
  const [payoutEdits, setPayoutEdits] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(initial?.payouts ?? {}).map(([id, amount]) => [id, String(amount)]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const winners = participants.filter((player) => winnerIds.includes(player.id));
  const losers = participants.filter((player) => !winnerIds.includes(player.id));
  const total = losers.reduce((sum, player) => sum + toAmount(paid[player.id] ?? ""), 0);
  const { base, remainder } = splitPot(total, winners.length);

  const payoutValue = (player: PlayerSnapshot, index: number): string =>
    payoutEdits[player.id] ?? (total > 0 ? String(base + (index < remainder ? 1 : 0)) : "");

  const payoutsTotal = winners.reduce(
    (sum, player, index) => sum + toAmount(payoutValue(player, index)),
    0,
  );
  const ready = winners.length > 0 && total > 0 && payoutsTotal === total;
  const suffix = currency ? ` ${currency}` : "";
  const hint =
    losers.length === 0
      ? "Leave at least one player as a loser."
      : total === 0
        ? "Enter what each loser paid."
        : payoutsTotal !== total
          ? `Winners' total ${payoutsTotal}${suffix} must equal ${total}${suffix}`
          : `Losers paid ${total}${suffix} · ${
              winners.length > 1 ? `split between ${winners.length} winners` : "all to the winner"
            }`;

  const toggleWinner = (id: string) => {
    setWinnerIds((current) =>
      current.includes(id) ? current.filter((winner) => winner !== id) : [...current, id],
    );
  };

  const submit = async () => {
    if (winners.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        winnerIds: winners.map((player) => player.id),
        paid: Object.fromEntries(
          losers.map((player) => [player.id, toAmount(paid[player.id] ?? "")]),
        ),
        payouts: Object.fromEntries(
          winners.map((player, index) => [player.id, toAmount(payoutValue(player, index))]),
        ),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the result");
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <span className="label">Winners</span>
        <p className="muted">Pick everyone who shares the winnings.</p>
        <PlayerPicker players={participants} selected={winnerIds} onToggle={toggleWinner} />
        {losers.length === 0 ? (
          <p className="negative">Leave at least one player as a loser.</p>
        ) : null}
      </Card>

      {winners.length > 0 && losers.length > 0 ? (
        <>
          <Card>
            <span className="label">What each loser paid</span>
            <div className="stack">
              {losers.map((player) => (
                <label className="row" key={player.id} htmlFor={`paid-${player.id}`}>
                  <span className="stat-row__name">{player.name}</span>
                  <div className="spacer" />
                  <input
                    id={`paid-${player.id}`}
                    className="text-input"
                    style={{ maxWidth: 120 }}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    placeholder="0"
                    value={paid[player.id] ?? ""}
                    onChange={(event) =>
                      setPaid((current) => ({ ...current, [player.id]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <span className="label">
              {winners.length === 1 ? "Winner was paid" : "Winners were paid"}
            </span>
            <div className="stack">
              {winners.map((player, index) => (
                <label className="row" key={player.id} htmlFor={`payout-${player.id}`}>
                  <span className="stat-row__name">{player.name}</span>
                  <div className="spacer" />
                  <input
                    id={`payout-${player.id}`}
                    className="text-input"
                    style={{ maxWidth: 120 }}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    placeholder="0"
                    value={payoutValue(player, index)}
                    onChange={(event) =>
                      setPayoutEdits((current) => ({
                        ...current,
                        [player.id]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <p className={total > 0 && payoutsTotal !== total ? "negative" : "muted"}>{hint}</p>
          </Card>
        </>
      ) : null}

      {error ? <p className="negative">{error}</p> : null}

      <Button variant="primary" size="lg" block disabled={busy || !ready} onClick={submit}>
        {busy ? "Saving…" : "Save result"}
      </Button>
    </>
  );
}
