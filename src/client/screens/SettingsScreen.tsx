import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppConfig, ConfigPlayer } from "../../domain";
import { Button, Card, Screen, TopBar } from "../components/ui";
import { newId } from "../id";
import { useConfig } from "../state/config";

export function SettingsScreen() {
  const navigate = useNavigate();
  const { config, save } = useConfig();
  const [draft, setDraft] = useState<AppConfig | null>(config);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const seeded = useRef(config !== null);

  useEffect(() => {
    if (seeded.current || !config) return;
    seeded.current = true;
    setDraft(config);
  }, [config]);

  if (!draft) {
    return (
      <Screen>
        <TopBar title="Settings" onBack={() => navigate("/")} />
        <p className="muted">Loading…</p>
      </Screen>
    );
  }

  const addPlayer = () => {
    const name = newName.trim();
    if (!name) return;
    const player: ConfigPlayer = { id: newId(), name };
    setDraft({ ...draft, players: [...draft.players, player] });
    setNewName("");
    setSaved(false);
  };

  const removePlayer = (id: string) => {
    setDraft({ ...draft, players: draft.players.filter((p) => p.id !== id) });
    setSaved(false);
  };

  const update = (patch: Partial<AppConfig>) => {
    setDraft({ ...draft, ...patch });
    setSaved(false);
  };

  const updateCurrency = (value: string) => {
    update({ currencyLabel: value });
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await save(draft);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar title="Settings" onBack={() => navigate("/")} />
      <div className="screen__body">
        <Card>
          <span className="label">Players</span>
          <div className="stack">
            {draft.players.map((player) => (
              <div className="row" key={player.id}>
                <span className="stat-row__name">{player.name}</span>
                <div className="spacer" />
                <Button size="sm" variant="ghost" onClick={() => removePlayer(player.id)}>
                  Remove
                </Button>
              </div>
            ))}
            {draft.players.length === 0 ? (
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
                value={draft.minRaise}
                onChange={(event) =>
                  update({ minRaise: Math.max(1, Number(event.target.value) || 1) })
                }
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
                value={draft.maxBet}
                onChange={(event) =>
                  update({ maxBet: Math.max(1, Number(event.target.value) || 1) })
                }
              />
            </label>
            <label className="row" htmlFor="currency">
              <span className="stat-row__name">Chip label (optional)</span>
              <div className="spacer" />
              <input
                id="currency"
                className="text-input"
                style={{ maxWidth: 120 }}
                value={draft.currencyLabel ?? ""}
                placeholder="chips"
                onChange={(event) => updateCurrency(event.target.value)}
              />
            </label>
          </div>
        </Card>

        {error ? <p className="negative">{error}</p> : null}
        {saved ? <p className="positive">Saved.</p> : null}
      </div>
      <Button variant="primary" size="lg" block disabled={busy} onClick={submit}>
        {busy ? "Saving…" : "Save settings"}
      </Button>
    </Screen>
  );
}
