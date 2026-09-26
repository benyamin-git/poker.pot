import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  type ActionType,
  type Command,
  type DerivedAction,
  type PlayerSnapshot,
  currentRoundIndex,
  deriveMatch,
} from "../../domain";
import { ActionSheet } from "../components/ActionSheet";
import { RoundsHistory } from "../components/RoundsHistory";
import { StartMatchSheet } from "../components/StartMatchSheet";
import { WinnersSheet } from "../components/WinnersSheet";
import { Button, Card, Center, Pill, Screen, StatRow, TopBar } from "../components/ui";
import { playerName } from "../format";
import { useConfig } from "../state/config";
import { useSession } from "../state/useSession";

type SheetState =
  | { kind: "start" }
  | { kind: "winners" }
  | { kind: "history" }
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
  const roundTotals = new Map<string, number>();
  for (const action of currentRound?.actions ?? []) {
    roundTotals.set(action.playerId, action.roundTotal);
  }
  const roundHigh = (currentRound?.actions ?? []).reduce(
    (high, action) => Math.max(high, action.roundTotal),
    0,
  );

  const contextBefore = (target: DerivedAction) => {
    let high = 0;
    let roundTotal = 0;
    let matchTotal = 0;
    for (const round of derived.rounds) {
      for (const action of round.actions) {
        if (action.id === target.id) {
          return { high, roundTotal, matchTotal, roundIndex: round.index };
        }
        if (action.playerId === target.playerId) {
          roundTotal += action.added;
          matchTotal += action.added;
        }
        high = Math.max(high, action.roundTotal);
      }
      high = 0;
      roundTotal = 0;
    }
    return { high: 0, roundTotal: 0, matchTotal: 0, roundIndex: 0 };
  };

  const openEdit = (action: DerivedAction) => {
    if (session.status === "ended") return;
    const player = match?.participants.find((p) => p.id === action.playerId);
    if (!player) return;
    setSheet({ kind: "edit", player, action, roundIndex: contextBefore(action).roundIndex });
  };

  const openPlayer = (player: PlayerSnapshot) => {
    if (done) return;
    const folded = derived.folded.includes(player.id);
    const allIn = derived.allIn.includes(player.id);
    const acted = actedThisRound.has(player.id);
    const roundTotal = roundTotals.get(player.id) ?? 0;
    const toAct = !folded && !allIn && (!acted || roundTotal < roundHigh);
    if (toAct) {
      setSheet({ kind: "record", player, roundIndex: index });
      return;
    }
    const latest =
      (currentRound?.actions ?? []).filter((a) => a.playerId === player.id).pop() ??
      derived.rounds
        .flatMap((r) => r.actions)
        .filter((a) => a.playerId === player.id)
        .pop();
    if (latest) openEdit(latest);
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
          <span className="label">Rounds</span>
          <RoundsHistory
            derived={derived}
            currency={currency}
            nameOf={(id) => playerName(id, session, config)}
            onEdit={session.status === "ended" ? undefined : openEdit}
          />
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

  const editContext = sheet?.kind === "edit" ? contextBefore(sheet.action) : null;

  return (
    <>
      <Screen>
        <TopBar
          title={`${match.participants.length}-player match`}
          onBack={() => navigate(`/sessions/${session.id}`)}
          action={
            <>
              <Pill status="active">live</Pill>
              <button
                type="button"
                className="icon-btn"
                aria-label="Round history"
                onClick={() => setSheet({ kind: "history" })}
              >
                ☰
              </button>
            </>
          }
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
              const roundTotal = roundTotals.get(player.id) ?? 0;
              const remaining = Math.max(
                0,
                config.maxBet - (derived.contributions[player.id] ?? 0),
              );
              const toCall = Math.min(Math.max(0, roundHigh - roundTotal), remaining);
              const toAct = !folded && !allIn && (!acted || roundTotal < roundHigh);
              const meta = folded
                ? "folded"
                : allIn
                  ? "all-in"
                  : toAct
                    ? roundHigh > 0
                      ? `call ${toCall}`
                      : "to act"
                    : `bet ${roundTotal}`;
              return (
                <button
                  key={player.id}
                  type="button"
                  className="player-btn"
                  data-done={!toAct}
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

        <Button
          variant={derived.active.length === 0 ? "primary" : "tonal"}
          size="lg"
          block
          onClick={() => setSheet({ kind: "winners" })}
        >
          {derived.active.length === 0 ? "Everyone is all-in — choose winners" : "Choose winners"}
        </Button>
      </Screen>

      {sheet?.kind === "record" ? (
        <ActionSheet
          mode="record"
          player={sheet.player}
          roundIndex={sheet.roundIndex}
          roundLabel={roundLabel(sheet.roundIndex)}
          roundHigh={roundHigh}
          playerRoundTotal={roundTotals.get(sheet.player.id) ?? 0}
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
          roundIndex={editContext?.roundIndex ?? sheet.roundIndex}
          roundLabel={roundLabel(editContext?.roundIndex ?? sheet.roundIndex)}
          roundHigh={editContext?.high ?? 0}
          playerRoundTotal={editContext?.roundTotal ?? 0}
          playerMatchTotal={editContext?.matchTotal ?? 0}
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

      {sheet?.kind === "winners" ? (
        <WinnersSheet
          participants={match.participants.filter((p) => !derived.folded.includes(p.id))}
          pot={derived.pot}
          currency={currency}
          onCancel={() => setSheet(null)}
          onSubmit={async (winnerIds) => {
            await sendCommand({ type: "selectWinners", matchId: match.id, winnerIds });
            setSheet(null);
          }}
        />
      ) : null}

      {sheet?.kind === "history" ? (
        <div className="sheet">
          <div className="sheet__panel">
            <div className="row">
              <h2 className="title-lg">Round history</h2>
              <div className="spacer" />
              <button
                type="button"
                className="icon-btn"
                aria-label="Close history"
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </div>
            <div className="screen__body">
              <RoundsHistory
                derived={derived}
                currency={currency}
                nameOf={(id) => playerName(id, session, config)}
                onEdit={(action) => openEdit(action)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
