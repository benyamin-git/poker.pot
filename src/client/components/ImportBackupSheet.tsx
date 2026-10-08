import { useEffect, useState } from "react";
import { type BackupBundle, type MergeConflict, importIntoStore, planMerge } from "../backup";
import { store } from "../storage";
import { ConfirmDialog } from "./dialogs";
import { Button, Card, Sheet } from "./ui";

type Mode = "merge" | "replace";
type Choice = "local" | "incoming";

function sideLabel(name: string, matches: number, updatedAt: string): string {
  const count = `${matches} ${matches === 1 ? "match" : "matches"}`;
  return `${name} · ${count} · ${new Date(updatedAt).toLocaleString()}`;
}

export function ImportBackupSheet({
  bundle,
  onClose,
  onImported,
}: {
  bundle: BackupBundle;
  onClose: () => void;
  onImported: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("merge");
  const [conflicts, setConflicts] = useState<MergeConflict[] | null>(null);
  const [choices, setChoices] = useState<Map<string, Choice>>(new Map());
  const [applyToAll, setApplyToAll] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    store.exportData().then((local) => {
      if (active) setConflicts(planMerge(local, bundle.data).conflicts);
    });
    return () => {
      active = false;
    };
  }, [bundle]);

  const choose = (id: string, choice: Choice) => {
    setChoices((current) => {
      const next = new Map(current);
      if (applyToAll && conflicts) {
        for (const conflict of conflicts) next.set(conflict.local.id, choice);
      } else {
        next.set(id, choice);
      }
      return next;
    });
  };

  const pending = conflicts?.filter((conflict) => !choices.has(conflict.local.id)).length ?? 0;
  const added = conflicts ? bundle.data.sessions.length - conflicts.length : 0;
  const ready = mode === "replace" || (conflicts !== null && pending === 0);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await importIntoStore(store, bundle, mode, choices);
      onImported(mode === "replace" ? "Backup restored." : "Backup merged.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <Sheet title="Import backup" onClose={onClose}>
      <div className="stack">
        <span className="label">How should this backup be applied?</span>
        <div className="row">
          <Button
            variant={mode === "merge" ? "primary" : "tonal"}
            block
            onClick={() => setMode("merge")}
          >
            Merge with current data
          </Button>
          <Button
            variant={mode === "replace" ? "primary" : "tonal"}
            block
            onClick={() => setMode("replace")}
          >
            Replace everything
          </Button>
        </div>
      </div>

      {mode === "merge" ? (
        conflicts === null ? (
          <p className="muted">Checking for conflicts…</p>
        ) : (
          <>
            <p className="muted">
              {added} new {added === 1 ? "session" : "sessions"} will be added
              {conflicts.length > 0
                ? `, and ${conflicts.length} ${conflicts.length === 1 ? "session conflicts" : "sessions conflict"}.`
                : "."}
            </p>
            {conflicts.length > 0 ? (
              <>
                <label className="row">
                  <span className="stat-row__name">Apply my next choice to all conflicts</span>
                  <div className="spacer" />
                  <input
                    type="checkbox"
                    checked={applyToAll}
                    onChange={(event) => setApplyToAll(event.target.checked)}
                  />
                </label>
                {conflicts.map((conflict) => {
                  const choice = choices.get(conflict.local.id);
                  return (
                    <Card key={conflict.local.id} layer={1}>
                      <p className="muted">
                        {sideLabel(
                          conflict.local.name,
                          conflict.local.matches.length,
                          conflict.local.updatedAt,
                        )}
                      </p>
                      <p className="muted">
                        {sideLabel(
                          conflict.incoming.name,
                          conflict.incoming.matches.length,
                          conflict.incoming.updatedAt,
                        )}
                      </p>
                      <div className="row">
                        <Button
                          variant={choice === "local" ? "primary" : "tonal"}
                          block
                          onClick={() => choose(conflict.local.id, "local")}
                        >
                          Keep local
                        </Button>
                        <Button
                          variant={choice === "incoming" ? "primary" : "tonal"}
                          block
                          onClick={() => choose(conflict.local.id, "incoming")}
                        >
                          Use imported
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </>
            ) : null}
          </>
        )
      ) : (
        <p className="muted">
          This deletes everything currently on this device and restores the backup instead.
        </p>
      )}

      {error ? <p className="negative">{error}</p> : null}
      <div className="row">
        <Button variant="ghost" block onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          block
          disabled={busy || !ready}
          onClick={() => (mode === "replace" ? setConfirming(true) : void run())}
        >
          {busy ? "Importing…" : mode === "replace" ? "Replace everything" : "Merge backup"}
        </Button>
      </div>

      {confirming ? (
        <ConfirmDialog
          title="Replace everything on this device?"
          message="Every session and player currently stored here is deleted and replaced by the backup."
          confirmLabel="Replace"
          danger
          onCancel={() => setConfirming(false)}
          onConfirm={() => void run()}
        />
      ) : null}
    </Sheet>
  );
}
