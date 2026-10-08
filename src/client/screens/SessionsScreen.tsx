import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SessionSummary } from "../../shared/api";
import { NewSessionSheet } from "../components/NewSessionSheet";
import { IconPlus } from "../components/icons";
import { Card, Center, Fab, Pill, Screen, StatRow, TopBar } from "../components/ui";
import { playerName } from "../format";
import { useConfig } from "../state/config";
import { useSessions } from "../state/useSessions";

function SessionCard({ session }: { session: SessionSummary }) {
  const navigate = useNavigate();
  const { config } = useConfig();
  const currency = config?.currencyLabel;
  const rows = Object.entries(session.balances).sort((a, b) => b[1] - a[1]);
  return (
    <Card tappable onClick={() => navigate(`/sessions/${session.id}`)}>
      <div className="row">
        <span className="title">{session.name}</span>
        <div className="spacer" />
        <Pill status={session.status}>{session.status}</Pill>
      </div>
      <p className="muted">
        {session.matchCount} {session.matchCount === 1 ? "match" : "matches"}
      </p>
      <div className="divider" />
      <div className="stack">
        {rows.map(([id, value]) => (
          <StatRow
            key={id}
            name={playerName(id, null, config)}
            value={value}
            currency={currency}
            signed
          />
        ))}
        {rows.length === 0 ? <p className="muted">No players yet.</p> : null}
      </div>
    </Card>
  );
}

export function SessionsScreen() {
  const navigate = useNavigate();
  const { config } = useConfig();
  const { sessions, loading, error } = useSessions();
  const [creating, setCreating] = useState(false);

  const players = config?.players ?? [];

  return (
    <>
      <Screen>
        <TopBar title="poker.pot" />
        <div className="screen__body">
          {error ? <p className="negative">{error}</p> : null}
          {loading && sessions.length === 0 ? (
            <Center>
              <p className="muted">Loading…</p>
            </Center>
          ) : null}
          {!loading && sessions.length === 0 ? (
            <Center>
              <p className="title">No sessions yet</p>
              <p className="muted">Start one and pass the phone around.</p>
            </Center>
          ) : null}
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      </Screen>
      <Fab
        label="New session"
        onClick={() => (players.length === 0 ? navigate("/settings") : setCreating(true))}
      >
        <IconPlus />
      </Fab>
      {creating ? (
        <NewSessionSheet
          players={players}
          onClose={() => setCreating(false)}
          onCreated={(id) => navigate(`/sessions/${id}`)}
        />
      ) : null}
    </>
  );
}
