import { useState } from "react";
import type { PlayerSnapshot, Session } from "../../domain";
import { PlayerPicker } from "./PlayerPicker";
import { Button } from "./ui";

export function RosterSheet({
  session,
  players,
  onSave,
  onClose,
}: {
  session: Session;
  players: PlayerSnapshot[];
  onSave: (playerIds: string[]) => Promise<void>;
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

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the roster");
      setBusy(false);
    }
  };

  return (
    <div className="sheet">
      <div className="sheet__panel">
        <h2 className="title-lg">Session players</h2>
        <p className="muted">
          Add or remove anyone from the config. This affects future matches; each match keeps its
          own roster.
        </p>
        <PlayerPicker players={players} selected={selected} onToggle={toggle} />
        {error ? <p className="negative">{error}</p> : null}
        <div className="row">
          <Button variant="ghost" block disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" block disabled={busy || selected.length === 0} onClick={save}>
            {busy ? "Saving…" : "Save roster"}
          </Button>
        </div>
      </div>
    </div>
  );
}
