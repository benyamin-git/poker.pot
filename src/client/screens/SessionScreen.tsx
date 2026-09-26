import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { type Command, deriveMatch, sessionBalances } from "../../domain";
import { api } from "../api";
import { ConfirmDialog, TypedConfirmDialog } from "../components/dialogs";
import { Button, Card, Center, Pill, Screen, StatRow, TopBar } from "../components/ui";
import { playerName } from "../format";
import { useConfig } from "../state/config";
import { useSession } from "../state/useSession";

type DialogKind = "pause" | "resume" | "end" | "remove" | null;

export function SessionScreen() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { config } = useConfig();
  const { session, loading, error, send } = useSession(sessionId);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [busy, setBusy] = useState(false);

  const balances = useMemo(
    () => (session && config ? sessionBalances(session, config) : {}),
    [session, config],
  );

  if (!session) {
    return (
      <Screen>
        <TopBar title="Session" onBack={() => navigate("/")} />
        <Center>
          <p className="muted">{error ?? (loading ? "Loading…" : "Session not found.")}</p>
        </Center>
      </Screen>
    );
  }

  const currency = config?.currencyLabel;
  const roster = session.players;
  const running = session.status === "active";
  const matches = [...session.matches].reverse();

  const act = async (command: Command) => {
    setBusy(true);
    try {
      await send(command);
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Screen>
        <TopBar
          title={session.name}
          onBack={() => navigate("/")}
          action={<Pill status={session.status}>{session.status}</Pill>}
        />
        <div className="screen__body">
          {error ? <p className="negative">{error}</p> : null}

          <Card>
            <span className="label">Standings</span>
            <div className="stack">
              {roster.map((player) => (
                <StatRow
                  key={player.id}
                  name={player.name}
                  value={balances[player.id] ?? 0}
                  currency={currency}
                  signed
                />
              ))}
            </div>
          </Card>

          {matches.length === 0 ? (
            <Card layer={1}>
              <p className="muted">No matches yet. Start one below.</p>
            </Card>
          ) : (
            matches.map((match) => {
              let pot = 0;
              let line = "In progress";
              try {
                const derived = config ? deriveMatch(match, config) : null;
                pot = derived?.pot ?? 0;
                if (derived && match.status === "done") {
                  line = match.participants
                    .map((p) => {
                      const net = (derived.payouts[p.id] ?? 0) - (derived.contributions[p.id] ?? 0);
                      return `${p.name} ${net > 0 ? "+" : ""}${net}`;
                    })
                    .join(" · ");
                } else if (derived) {
                  line = `In progress · pot ${pot}`;
                }
              } catch {
                line = "Unreadable match";
              }
              return (
                <Card
                  key={match.id}
                  tappable
                  onClick={() => navigate(`/sessions/${session.id}/matches/${match.id}`)}
                >
                  <div className="row">
                    <span className="title">{match.participants.length}-player match</span>
                    <div className="spacer" />
                    <Pill status={match.status === "done" ? "ended" : "active"}>
                      {match.status === "done" ? "finished" : "live"}
                    </Pill>
                  </div>
                  <p className="history-card__line">{line}</p>
                  {match.status === "done" && match.winners.length > 0 ? (
                    <p className="muted">
                      Won by {match.winners.map((id) => playerName(id, session, config)).join(", ")}
                    </p>
                  ) : null}
                </Card>
              );
            })
          )}
        </div>

        <div className="stack">
          <Button
            variant="primary"
            size="lg"
            block
            disabled={!running || busy}
            onClick={() => navigate(`/sessions/${session.id}/matches/new`)}
          >
            Start a match
          </Button>
          <div className="row">
            <Button
              variant="tonal"
              block
              disabled={busy}
              onClick={() => setDialog(running ? "pause" : "resume")}
            >
              {running ? "Pause session" : "Resume session"}
            </Button>
            <Button variant="tonal" block disabled={busy} onClick={() => setDialog("end")}>
              End session
            </Button>
          </div>
          <Button variant="ghost" block disabled={busy} onClick={() => setDialog("remove")}>
            Remove session
          </Button>
        </div>
      </Screen>

      {dialog === "pause" ? (
        <ConfirmDialog
          title="Pause session?"
          message="You can resume it later. No data is lost."
          confirmLabel="Pause"
          onCancel={() => setDialog(null)}
          onConfirm={() => void act({ type: "pauseSession" })}
        />
      ) : null}
      {dialog === "resume" ? (
        <ConfirmDialog
          title="Resume session?"
          message="The session becomes active again."
          confirmLabel="Resume"
          onCancel={() => setDialog(null)}
          onConfirm={() => void act({ type: "resumeSession" })}
        />
      ) : null}
      {dialog === "end" ? (
        <ConfirmDialog
          title="End session?"
          message="Ending locks the session permanently. Its history stays readable but nothing can change."
          confirmLabel="End session"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => void act({ type: "endSession" })}
        />
      ) : null}
      {dialog === "remove" ? (
        <TypedConfirmDialog
          title="Delete this session forever?"
          message={
            <>
              This permanently deletes <strong>{session.name}</strong> and every match in it. This
              cannot be undone.
            </>
          }
          phrase="delete session"
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api.deleteSession(session.id);
              navigate("/", { replace: true });
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </>
  );
}
