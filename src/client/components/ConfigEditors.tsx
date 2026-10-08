import { useState } from "react";
import type { AppConfig, ConfigPlayer } from "../../domain";
import { newId } from "../id";
import { Button, Card } from "./ui";

export function PlayersEditor({
  value,
  onChange,
}: {
  value: AppConfig;
  onChange: (next: AppConfig) => void;
}) {
  const [newName, setNewName] = useState("");

  const addPlayer = () => {
    const name = newName.trim();
    if (!name) return;
    const player: ConfigPlayer = { id: newId(), name };
    onChange({ ...value, players: [...value.players, player] });
    setNewName("");
  };

  const removePlayer = (id: string) => {
    onChange({ ...value, players: value.players.filter((player) => player.id !== id) });
  };

  return (
    <Card>
      <span className="label">Players</span>
      <div className="stack">
        {value.players.map((player) => (
          <div className="row" key={player.id}>
            <span className="stat-row__name">{player.name}</span>
            <div className="spacer" />
            <Button size="sm" variant="ghost" onClick={() => removePlayer(player.id)}>
              Remove
            </Button>
          </div>
        ))}
        {value.players.length === 0 ? (
          <p className="muted">No players yet. Add the people you play with.</p>
        ) : null}
      </div>
      <div className="row">
        <input
          className="text-input"
          value={newName}
          placeholder="Player name"
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addPlayer();
          }}
        />
        <Button variant="tonal" onClick={addPlayer} disabled={!newName.trim()}>
          Add
        </Button>
      </div>
      <p className="muted">
        Removing a player only affects future matches — past history keeps their name.
      </p>
    </Card>
  );
}

export function RulesEditor({
  value,
  onChange,
}: {
  value: AppConfig;
  onChange: (next: AppConfig) => void;
}) {
  const update = (patch: Partial<AppConfig>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <Card>
      <span className="label">Rules</span>
      <div className="stack">
        <label className="row" htmlFor="minRaise">
          <span className="stat-row__name">Minimum raise</span>
          <div className="spacer" />
          <input
            id="minRaise"
            className="text-input"
            style={{ maxWidth: 120 }}
            type="number"
            inputMode="numeric"
            min={1}
            value={value.minRaise}
            onChange={(event) => update({ minRaise: Math.max(1, Number(event.target.value) || 1) })}
          />
        </label>
        <label className="row" htmlFor="maxBet">
          <span className="stat-row__name">Max bet (all-in)</span>
          <div className="spacer" />
          <input
            id="maxBet"
            className="text-input"
            style={{ maxWidth: 120 }}
            type="number"
            inputMode="numeric"
            min={1}
            value={value.maxBet}
            onChange={(event) => update({ maxBet: Math.max(1, Number(event.target.value) || 1) })}
          />
        </label>
        <label className="row" htmlFor="currency">
          <span className="stat-row__name">Chip label (optional)</span>
          <div className="spacer" />
          <input
            id="currency"
            className="text-input"
            style={{ maxWidth: 120 }}
            value={value.currencyLabel ?? ""}
            placeholder="chips"
            onChange={(event) => update({ currencyLabel: event.target.value })}
          />
        </label>
      </div>
    </Card>
  );
}
