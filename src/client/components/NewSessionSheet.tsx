import { useState } from "react";
import { store } from "../storage";
import { PlayerPicker } from "./PlayerPicker";
import { Button, Sheet } from "./ui";

export function NewSessionSheet({
  players,
  onCreated,
  onClose,
}: {
  players: { id: string; name: string }[];
  onCreated: (sessionId: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("Poker night");
  const [selected, setSelected] = useState<string[]>(players.map((p) => p.id));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const session = await store.createSession(name.trim() || "Poker night", selected);
      onCreated(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the session");
      setBusy(false);
    }
  };

  return (
    <Sheet title="New session" onClose={onClose}>
      <div className="stack">
        <label className="label" htmlFor="sessionName">
          Name
        </label>
        <input
          id="sessionName"
          className="text-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="stack">
        <span className="label">Players at the table</span>
        <PlayerPicker players={players} selected={selected} onToggle={toggle} />
      </div>
      {error ? <p className="negative">{error}</p> : null}
      <div className="row">
        <Button variant="ghost" block onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" block disabled={busy || selected.length === 0} onClick={create}>
          {busy ? "Creating…" : "Create session"}
        </Button>
      </div>
    </Sheet>
  );
}
