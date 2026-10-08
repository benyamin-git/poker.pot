import { type ChangeEvent, useState } from "react";
import type { AppConfig } from "../../domain";
import { type BackupBundle, readBackupFile } from "../backup";
import { PlayersEditor, RulesEditor } from "../components/ConfigEditors";
import { ImportBackupSheet } from "../components/ImportBackupSheet";
import { Button, Card, Screen, TopBar } from "../components/ui";
import { DEFAULT_CONFIG, store } from "../storage";

export type OnboardingStep = "welcome" | "players" | "limits" | "finish";

export function OnboardingScreen({
  initialStep = "welcome",
  onDone,
}: {
  initialStep?: OnboardingStep;
  onDone?: () => void;
}) {
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [draft, setDraft] = useState<AppConfig>(DEFAULT_CONFIG);
  const [importBundle, setImportBundle] = useState<BackupBundle | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setMessage(null);
    try {
      setImportBundle(await readBackupFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that backup");
    }
  };

  const finishImport = async () => {
    setImportBundle(null);
    setDraft(await store.getConfig());
    setMessage("Backup imported. Add or adjust your players, then continue.");
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await store.saveConfig(draft);
      await store.completeOnboarding();
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish setup");
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar title="poker.pot" />
      <div className="screen__body">
        {step === "welcome" ? (
          <Card>
            <span className="label">Welcome to poker.pot</span>
            <p className="muted">
              The whole ledger lives on this device — no account, no server. Works at the table
              wherever you are.
            </p>
            <Button variant="primary" block onClick={() => setStep("players")}>
              Start fresh
            </Button>
            <label className="label" htmlFor="onboardImport">
              Import a backup
            </label>
            <input
              id="onboardImport"
              className="text-input"
              type="file"
              accept=".yaml,.yml,application/yaml"
              onChange={(event) => void pickImport(event)}
            />
            {message ? <p className="positive">{message}</p> : null}
            {error ? <p className="negative">{error}</p> : null}
          </Card>
        ) : null}

        {step === "players" ? (
          <>
            <PlayersEditor value={draft} onChange={setDraft} />
            <div className="row">
              <Button variant="ghost" block onClick={() => setStep("welcome")}>
                Back
              </Button>
              <Button variant="primary" block onClick={() => setStep("limits")}>
                Next
              </Button>
            </div>
          </>
        ) : null}

        {step === "limits" ? (
          <>
            <RulesEditor value={draft} onChange={setDraft} />
            <div className="row">
              <Button variant="ghost" block onClick={() => setStep("players")}>
                Back
              </Button>
              <Button variant="primary" block onClick={() => setStep("finish")}>
                Next
              </Button>
            </div>
          </>
        ) : null}

        {step === "finish" ? (
          <Card>
            <span className="label">Ready</span>
            <p className="muted">
              {draft.players.length} {draft.players.length === 1 ? "player" : "players"} · min raise{" "}
              {draft.minRaise} · max bet {draft.maxBet}
            </p>
            <p className="muted">
              Start a session when the table is set. Export a backup from Settings whenever you
              like.
            </p>
            <Button variant="primary" block disabled={busy} onClick={() => void finish()}>
              {busy ? "Starting…" : "Start using poker.pot"}
            </Button>
            {error ? <p className="negative">{error}</p> : null}
          </Card>
        ) : null}
      </div>

      {importBundle ? (
        <ImportBackupSheet
          bundle={importBundle}
          onClose={() => setImportBundle(null)}
          onImported={() => void finishImport()}
        />
      ) : null}
    </Screen>
  );
}
