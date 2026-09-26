import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  type Action,
  type ActionType,
  type Command,
  type DerivedAction,
  type PlayerSnapshot,
  currentRoundIndex,
  deriveMatch,
} from "../../domain";
import { ActionSheet } from "../components/ActionSheet";
import { StartMatchSheet } from "../components/StartMatchSheet";
import { Button, Card, Center, Pill, Screen, StatRow, TopBar } from "../components/ui";
import { playerName } from "../format";
import { useConfig } from "../state/config";
import { useSession } from "../state/useSession";

type SheetState =
  | { kind: "start" }
  | { kind: "record"; player: PlayerSnapshot; roundIndex: number }
  | { kind: "edit"; player: PlayerSnapshot; action: DerivedAction; roundIndex: number }
  | null;

function roundLabel(index: number): string {
  return index === 0 ? "Preflop" : `Round ${index + 1}`;
}

export function MatchScreen() {
  const { sessionId, matchId } = useParams();
  const navigate = useNavigate();
  const { config } = useConfig();
  const { session, loading, error, send } = useSession(sessionId);
  const [sheet, setSheet] = useState<SheetState>(null);

  const match = session?.matches.find((m) => m.id === matchId);

  const derived = useMemo(() => {
    if (!match || !config) return null;
    try {
      return deriveMatch(match, config);
    } catch {
      return null;
    }
  }, [match, config]);

  const sendCommand = async (command: Command) => {
    return await send(command);
  };

  if (!session || !config) {
    return (
      <Screen>
        <TopBar title="Match" onBack={() => navigate(`/sessions/${sessionId ?? ""}`)} />
        <Center>
          <p className="muted">{error ?? (loading ? "Loading…" : "Session not found.")}</p>
        </Center>
      </Screen>
    );
  }

  if (matchId === "new") {
    return (
      <Screen>
        <TopBar title="New match" onBack={() => navigate(`/sessions/${session.id}`)} />
        <StartMatchSheet
          session={session}
          players={config.players}
          onClose={() => navigate(`/sessions/${session.id}`)}
          onStart={async (participantIds) => {
            const next = await sendCommand({ type: "startMatch", participantIds });
            const created = next?.matches[next.matches.length - 1];
            if (created) {
              navigate(`/sessions/${session.id}/matches/${created.id}`, { replace: true });
            }
          }}
        />
      </Screen>
    );
  }

  if (!match || !derived) {
    return (
      <Screen>
        <TopBar title="Match" onBack={() => navigate(`/sessions/${session.id}`)} />
        <Center>
          <p className="muted">This match could not be loaded.</p>
        </Center>
      </Screen>
    );
  }

  const currency = config.currencyLabel;
  const done = match.status === "done";
  const index = done ? -1 : currentRoundIndex(derived);
  const currentRound = derived.rounds.find((r) => r.index === index);
  const actedThisRound = new Set((currentRound?.actions ?? []).map((a) => a.playerId));
  const roundHigh = (currentRound?.actions ?? []).reduce(
    (high, action) => Math.max(high, action.roundTotal),
    0,
  );

  const contextFor = (roundIndex: number, action?: Action) => {
    const round = derived.rounds.find((r) => r.index === roundIndex);
    const actions = round?.actions ?? [];
    const prior = action
      ? actions.slice(
          0,
          Math.max(
            0,
            actions.findIndex((a) => a.id === action.id),
          ),
        )
      : actions;
    const high = prior.reduce((max, a) => Math.max(max, a.roundTotal), 0);
    return { high };
  };

  const openPlayer = (player: PlayerSnapshot) => {
    if (done) return;
    const folded = derived.folded.includes(player.id);
    const allIn = derived.allIn.includes(player.id);
    const acted = actedThisRound.has(player.id);
    if (!folded && !allIn && !acted) {
      setSheet({ kind: "record", player, roundIndex: index });
      return;
    }
    const latest =
      (currentRound?.actions ?? []).find((a) => a.playerId === player.id) ??
      derived.rounds
        .flatMap((r) => r.actions)
        .filter((a) => a.playerId === player.id)
        .pop();
    if (latest) {
      const containing = derived.rounds.find((r) => r.actions.some((a) => a.id === latest.id));
      setSheet({
        kind: "edit",
        player,
        action: latest,
        roundIndex: containing?.index ?? 0,
      });
    }
  };

  if (done) {
    return (
      <Screen>
        <TopBar
          title={`${match.participants.length}-player match`}
          onBack={() => navigate(`/sessions/${session.id}`)}
          action={<Pill status="ended">finished</Pill>}
        />
        <div className="screen__body">
          <Card>
            <span className="label">Pot</span>
            <p className="display amount">
              {derived.pot}
              {currency ? ` ${currency}` : ""}
            </p>
            <p className="muted">
              Won by {match.winners.map((id) => playerName(id, session, config)).join(", ")}
            </p>
          </Card>
          <Card>
            <span className="label">Result</span>
            <div className="stack">
              {match.participants.map((player) => (
                <StatRow
                  key={player.id}
                  name={player.name}
                  value={
                    (derived.payouts[player.id] ?? 0) - (derived.contributions[player.id] ?? 0)
                  }
                  currency={currency}
                  signed
                />
              ))}
            </div>
          </Card>
        </div>
        <Button
          variant="primary"
          size="lg"
          block
          onClick={() => navigate(`/sessions/${session.id}`)}
        >
          Back to session
        </Button>
      </Screen>
    );
  }

  return (
    <>
      <Screen>
        <TopBar
          title={`${match.participants.length}-player match`}
          onBack={() => navigate(`/sessions/${session.id}`)}
          action={<Pill status="active">live</Pill>}
        />
        <div className="screen__body screen__body--fixed">
          <Card>
            <div className="row">
              <span className="label">Pot</span>
              <div className="spacer" />
              <span className="label">{roundLabel(index)}</span>
            </div>
            <p className="display amount">
              {derived.pot}
              {currency ? ` ${currency}` : ""}
            </p>
            <p className="muted">
              Current bet {roundHigh}
              {derived.active.length === 0 ? " · everyone is all-in" : ""}
            </p>
          </Card>

          <div className="player-grid" data-cols={match.participants.length > 4 ? "3" : "2"}>
            {match.participants.map((player) => {
              const folded = derived.folded.includes(player.id);
              const allIn = derived.allIn.includes(player.id);
              const acted = actedThisRound.has(player.id);
              const action = (currentRound?.actions ?? []).find((a) => a.playerId === player.id);
              const meta = folded
                ? "folded"
                : allIn
                  ? "all-in"
                  : acted
                    ? `bet ${action?.roundTotal ?? 0}`
                    : "to act";
              return (
                <button
                  key={player.id}
                  type="button"
                  className="player-btn"
                  data-done={acted || folded || allIn}
                  data-folded={folded}
                  data-allin={allIn}
                  onClick={() => openPlayer(player)}
                >
                  <span>{player.name}</span>
                  <span className="player-btn__meta">{meta}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Screen>

      {sheet?.kind === "record" ? (
        <ActionSheet
          mode="record"
          player={sheet.player}
          roundIndex={sheet.roundIndex}
          roundLabel={roundLabel(sheet.roundIndex)}
          roundHigh={contextFor(sheet.roundIndex).high}
          playerRoundTotal={0}
          playerMatchTotal={derived.contributions[sheet.player.id] ?? 0}
          pot={derived.pot}
          minRaise={config.minRaise}
          maxBet={config.maxBet}
          currency={currency}
          onCancel={() => setSheet(null)}
          onSubmit={async (type: ActionType, amount) => {
            await sendCommand({
              type: "recordAction",
              matchId: match.id,
              playerId: sheet.player.id,
              actionType: type,
              amount,
            });
            setSheet(null);
          }}
        />
      ) : null}

      {sheet?.kind === "edit" ? (
        <ActionSheet
          mode="edit"
          player={sheet.player}
          initial={sheet.action}
          roundIndex={sheet.roundIndex}
          roundLabel={roundLabel(sheet.roundIndex)}
          roundHigh={contextFor(sheet.roundIndex, sheet.action).high}
          playerRoundTotal={0}
          playerMatchTotal={Math.max(
            0,
            (derived.contributions[sheet.player.id] ?? 0) - sheet.action.added,
          )}
          pot={derived.pot}
          minRaise={config.minRaise}
          maxBet={config.maxBet}
          currency={currency}
          onCancel={() => setSheet(null)}
          onSubmit={async (type, amount) => {
            await sendCommand({
              type: "editAction",
              matchId: match.id,
              actionId: sheet.action.id,
              actionType: type,
              amount,
            });
            setSheet(null);
          }}
          onDelete={async () => {
            await sendCommand({
              type: "deleteAction",
              matchId: match.id,
              actionId: sheet.action.id,
            });
            setSheet(null);
          }}
        />
      ) : null}
    </>
  );
}
