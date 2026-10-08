import { useState } from "react";
import type { PlayerSnapshot } from "../../domain";
import { Button, Sheet } from "./ui";

export function WinnersSheet({
  participants,
  pot,
  currency,
  onCancel,
  onSubmit,
}: {
  participants: PlayerSnapshot[];
  pot: number;
  currency?: string | undefined;
  onCancel: () => void;
  onSubmit: (winnerIds: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  };

  const count = selected.length;
  const share = count > 0 ? Math.floor(pot / count) : 0;
  const remainder = count > 0 ? pot - share * count : 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save winners");
      setBusy(false);
    }
  };

  return (
    <Sheet title="Choose winners" onClose={onCancel}>
      <div className="row">
        <span className="label">Pot</span>
        <div className="spacer" />
        <span className="muted">{count > 0 ? `${count} winner(s)` : "pick winners"}</span>
      </div>
      <p className="display amount">
        {pot}
        {currency ? ` ${currency}` : ""}
      </p>
      {count > 0 ? (
        <p className="muted">
          {share}
          {currency ? ` ${currency}` : ""} each
          {remainder > 0
            ? ` · ${remainder} extra ${remainder === 1 ? "chip" : "chips"} assigned by chance`
            : ""}
        </p>
      ) : (
        <p className="muted">Tap everyone who shares the pot. Shares are equal.</p>
      )}

      <div className="player-grid" data-cols={participants.length > 4 ? "3" : "2"}>
        {participants.map((player) => (
          <button
            key={player.id}
            type="button"
            className="player-btn"
            data-done={!selected.includes(player.id)}
            onClick={() => toggle(player.id)}
          >
            <span>{player.name}</span>
            <span className="player-btn__meta">
              {selected.includes(player.id) ? "winner" : "tap to pick"}
            </span>
          </button>
        ))}
      </div>

      {error ? <p className="negative">{error}</p> : null}
      <div className="row">
        <Button variant="ghost" block disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" block disabled={busy || count === 0} onClick={submit}>
          {busy ? "Saving…" : "Confirm winners"}
        </Button>
      </div>
    </Sheet>
  );
}
