import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppConfig } from "../../domain";
import { type BackupBundle, exportFromStore, readBackupFile } from "../backup";
import { PlayersEditor, RulesEditor } from "../components/ConfigEditors";
import { ImportBackupSheet } from "../components/ImportBackupSheet";
import { IconCheck } from "../components/icons";
import { Button, Card, Screen, TopBar } from "../components/ui";
import { useConfig } from "../state/config";
import { store } from "../storage";
import { ACCENTS, type Accent, THEMES, type Theme, useAppearance } from "../theme";

const THEME_LABELS: Record<Theme, string> = { light: "Light", dark: "Dark", oled: "OLED" };

const ACCENT_LABELS: Record<Accent, string> = {
  blue: "Blue",
  teal: "Teal",
  green: "Green",
  orange: "Orange",
  rose: "Rose",
  violet: "Violet",
};

export function AppearanceSettings() {
  const [appearance, setAppearance] = useAppearance();
  return (
    <Card>
      <span className="label">Appearance</span>
      <div className="stack">
        <fieldset className="segmented">
          <legend className="visually-hidden">Theme</legend>
          {THEMES.map((theme) => (
            <label
              key={theme}
              className="segmented__option"
              data-selected={appearance.theme === theme}
            >
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={appearance.theme === theme}
                onChange={() => setAppearance({ ...appearance, theme })}
              />
              {THEME_LABELS[theme]}
            </label>
          ))}
        </fieldset>
        <fieldset className="swatches">
          <legend className="visually-hidden">Accent color</legend>
          {ACCENTS.map((accent) => (
            <button
              key={accent}
              type="button"
              className="swatch"
              data-accent={accent}
              data-selected={appearance.accent === accent}
              aria-pressed={appearance.accent === accent}
              aria-label={ACCENT_LABELS[accent]}
              onClick={() => setAppearance({ ...appearance, accent })}
            >
              {appearance.accent === accent ? <IconCheck size={18} /> : null}
            </button>
          ))}
        </fieldset>
      </div>
    </Card>
  );
}

export function SettingsScreen() {
  const navigate = useNavigate();
  const { config, save, refresh } = useConfig();
  const [draft, setDraft] = useState<AppConfig | null>(config);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const seeded = useRef(config !== null);
  const [backupAt, setBackupAt] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [backupRevision, setBackupRevision] = useState<number | null>(null);
  const [importBundle, setImportBundle] = useState<BackupBundle | null>(null);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const refreshBackupState = useCallback(async () => {
    const [at, lastRevision, current] = await Promise.all([
      store.getLastBackupAt(),
      store.getLastBackupRevision(),
      store.getRevision(),
    ]);
    setBackupAt(at);
    setBackupRevision(lastRevision);
    setRevision(current);
  }, []);

  useEffect(() => {
    void refreshBackupState();
  }, [refreshBackupState]);

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

  const exportBackup = async () => {
    setExporting(true);
    setDataError(null);
    setDataMessage(null);
    try {
      const result = await exportFromStore(store);
      if (result !== "cancelled") {
        setDataMessage(result === "shared" ? "Backup shared." : "Backup saved.");
      }
      await refreshBackupState();
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Could not export the backup");
    } finally {
      setExporting(false);
    }
  };

  const pickImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setDataError(null);
    setDataMessage(null);
    try {
      setImportBundle(await readBackupFile(file));
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Could not read that backup");
    }
  };

  const finishImport = async (message: string) => {
    setImportBundle(null);
    setDataMessage(message);
    const next = await store.getConfig();
    await refresh();
    setDraft(next);
    await refreshBackupState();
  };

  return (
    <Screen>
      <TopBar title="Settings" onBack={() => navigate("/")} />
      <div className="screen__body">
        <PlayersEditor
          value={draft}
          onChange={(next) => {
            setDraft(next);
            setSaved(false);
          }}
        />

        <RulesEditor
          value={draft}
          onChange={(next) => {
            setDraft(next);
            setSaved(false);
          }}
        />

        <AppearanceSettings />

        <Card>
          <span className="label">Data</span>
          <div className="stack">
            <p className="muted">
              Everything lives on this device. Export a backup before switching phones or clearing
              browser data.
            </p>
            {revision !== (backupRevision ?? 0) ? (
              <output className="muted">Changes since your last backup aren't included yet.</output>
            ) : null}
            <p className="muted">
              Last backup: {backupAt ? new Date(backupAt).toLocaleString() : "never"}
            </p>
            <Button variant="tonal" block disabled={exporting} onClick={() => void exportBackup()}>
              {exporting ? "Preparing…" : "Export backup"}
            </Button>
            <label className="label" htmlFor="importBackup">
              Import backup
            </label>
            <input
              id="importBackup"
              className="text-input"
              type="file"
              accept=".yaml,.yml,application/yaml"
              onChange={(event) => void pickImport(event)}
            />
            {dataMessage ? <p className="positive">{dataMessage}</p> : null}
            {dataError ? <p className="negative">{dataError}</p> : null}
          </div>
        </Card>

        {error ? <p className="negative">{error}</p> : null}
        {saved ? <p className="positive">Saved.</p> : null}
      </div>
      <Button variant="primary" size="lg" block disabled={busy} onClick={submit}>
        {busy ? "Saving…" : "Save settings"}
      </Button>

      {importBundle ? (
        <ImportBackupSheet
          bundle={importBundle}
          onClose={() => setImportBundle(null)}
          onImported={(message) => void finishImport(message)}
        />
      ) : null}
    </Screen>
  );
}
