import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { Button, Card, Screen, TopBar } from "../components/ui";

export function SetupScreen() {
  const navigate = useNavigate();
  const [dataDir, setDataDir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.configure(dataDir.trim());
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar title="poker.pot" />
      <div className="screen__body">
        <Card>
          <h2 className="title">Choose your private data folder</h2>
          <p className="muted">
            Sessions and config are stored here. Keep it outside this repository and back it up with
            a private git repo — this project is public.
          </p>
        </Card>
        <Card layer={3}>
          <label className="label" htmlFor="dataDir">
            Absolute path
          </label>
          <input
            id="dataDir"
            className="text-input"
            value={dataDir}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="/home/you/poker-pot-data"
            onChange={(event) => setDataDir(event.target.value)}
          />
        </Card>
        {error ? <p className="negative">{error}</p> : null}
      </div>
      <Button
        variant="primary"
        size="lg"
        block
        disabled={busy || dataDir.trim().length === 0}
        onClick={submit}
      >
        {busy ? "Saving…" : "Use this folder"}
      </Button>
    </Screen>
  );
}
