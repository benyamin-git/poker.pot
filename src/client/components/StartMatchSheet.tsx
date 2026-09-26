import { useState } from "react";
import type { PlayerSnapshot, Session } from "../../domain";
import { PlayerPicker } from "./PlayerPicker";
import { Button } from "./ui";

export function StartMatchSheet({
  session,
  players,
  onStart,
  onClose,
}: {
  session: Session;
  players: PlayerSnapshot[];
  onStart: (participantIds: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(session.players.map((p) => p.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await onStart(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the match");
      setBusy(false);
    }
  };

  return (
    <div className="sheet">
      <div className="sheet__panel">
        <h2 className="title-lg">Who is in this match?</h2>
        <p className="muted">
          Defaults to the session roster. Add or remove anyone from the config — this only affects
          this match.
        </p>
        <PlayerPicker players={players} selected={selected} onToggle={toggle} />
        {error ? <p className="negative">{error}</p> : null}
        <div className="row">
          <Button variant="ghost" block disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" block disabled={busy || selected.length < 2} onClick={start}>
            {busy ? "Starting…" : "Start match"}
          </Button>
        </div>
      </div>
    </div>
  );
}
