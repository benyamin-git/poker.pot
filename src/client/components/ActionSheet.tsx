import { useMemo, useState } from "react";
import type { Action, ActionType, PlayerSnapshot } from "../../domain";
import { ConfirmDialog } from "./dialogs";
import { NumberPad } from "./numpad";
import { Button, Sheet } from "./ui";

export interface ActionSheetProps {
  player: PlayerSnapshot;
  roundLabel: string;
  roundIndex: number;
  roundHigh: number;
  playerRoundTotal: number;
  playerMatchTotal: number;
  pot: number;
  minRaise: number;
  maxBet: number;
  currency?: string | undefined;
  mode: "record" | "edit";
  initial?: Action | undefined;
  onCancel: () => void;
  onSubmit: (type: ActionType, amount: number) => Promise<void>;
  onDelete?: (() => Promise<void>) | undefined;
}

export function ActionSheet({
  player,
  roundLabel,
  roundIndex,
  roundHigh,
  playerRoundTotal,
  playerMatchTotal,
  pot,
  minRaise,
  maxBet,
  currency,
  mode,
  initial,
  onCancel,
  onSubmit,
  onDelete,
}: ActionSheetProps) {
  const preflop = roundIndex === 0;
  const remaining = Math.max(0, maxBet - playerMatchTotal);
  const toCall = Math.max(0, roundHigh - playerRoundTotal);
  const callAmount = Math.min(toCall, remaining);
  const minRaiseTo = roundHigh + minRaise;
  const minRaiseBy = Math.max(1, minRaiseTo - playerRoundTotal);
  const canRaise = remaining > 0;

  const [type, setType] = useState<ActionType>(() => {
    if (initial) return initial.type;
    if (toCall > 0) return "call";
    return preflop ? "raise" : "check";
  });
  const [amount, setAmount] = useState<number>(
    initial?.type === "raise" ? initial.amount : Math.min(minRaiseBy, Math.max(remaining, 1)),
  );
  const [busy, setBusy] = useState(false);
  const [confirmingEdit, setConfirmingEdit] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const raiseTotal = playerRoundTotal + amount;
  const raiseMatchTotal = playerMatchTotal + amount;
  const isAllIn = raiseMatchTotal >= maxBet;

  const options = useMemo(() => {
    const list: { type: ActionType; label: string }[] = [];
    if (preflop) {
      list.push({ type: "fold", label: "Fold" });
      if (toCall > 0 && callAmount > 0) {
        list.push({
          type: "call",
          label: callAmount < toCall ? `All in ${callAmount}` : `Call ${callAmount}`,
        });
      }
      if (canRaise) list.push({ type: "raise", label: "Raise" });
    } else {
      if (roundHigh === 0) list.push({ type: "check", label: "Check" });
      if (toCall > 0 && callAmount > 0) {
        list.push({
          type: "call",
          label: callAmount < toCall ? `All in ${callAmount}` : `Call ${callAmount}`,
        });
      }
      if (canRaise) list.push({ type: "raise", label: "Raise" });
      list.push({ type: "fold", label: "Fold" });
    }
    return list;
  }, [preflop, canRaise, roundHigh, toCall, callAmount]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(type, type === "raise" ? amount : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
    }
  };

  const confirm = () => {
    if (mode === "edit") {
      setConfirmingEdit(true);
      return;
    }
    void submit();
  };

  return (
    <>
      <Sheet title={mode === "edit" ? "Edit history" : "Betting"} onClose={onCancel} full>
        <div className="row">
          <span className="label">{roundLabel}</span>
          <div className="spacer" />
          <span className="muted">{player.name}</span>
        </div>

        <div>
          <span className="label">Pot</span>
          <p className="display amount">
            {pot}
            {currency ? ` ${currency}` : ""}
          </p>
        </div>

        <div className="row">
          <div>
            <span className="label">Your match bet</span>
            <p className="title-lg amount">
              {playerMatchTotal}
              {isAllIn ? " · all in" : ""}
            </p>
          </div>
          <div className="spacer" />
          <div>
            <span className="label">This round</span>
            <p className="title-lg amount">
              {type === "raise"
                ? raiseTotal
                : type === "call"
                  ? playerRoundTotal + callAmount
                  : playerRoundTotal}
            </p>
          </div>
        </div>

        <div className="choice-grid">
          {options.map((option) => (
            <button
              key={option.type}
              type="button"
              className="choice"
              data-selected={type === option.type}
              onClick={() => setType(option.type)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {type === "raise" ? (
          <>
            <div className="row">
              <Button
                size="sm"
                variant="tonal"
                onClick={() => setAmount(Math.min(minRaiseBy, remaining))}
              >
                Min +{minRaiseBy}
              </Button>
              <Button
                size="sm"
                variant="tonal"
                onClick={() => setAmount(Math.min(amount + minRaise, remaining))}
              >
                +{minRaise}
              </Button>
              <Button size="sm" variant="tonal" onClick={() => setAmount(remaining)}>
                All in {remaining}
              </Button>
            </div>
            <p className="muted">
              Raise +{amount} → {raiseTotal} this round, {raiseMatchTotal} in the match
            </p>
            <NumberPad value={amount} onChange={setAmount} max={remaining} />
          </>
        ) : null}

        {error ? <p className="negative">{error}</p> : null}

        <div className="row">
          <Button variant="ghost" block disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            block
            disabled={busy || (type === "raise" && !canRaise)}
            onClick={confirm}
          >
            {mode === "edit" ? "Save change" : "Confirm"}
          </Button>
        </div>
        {mode === "edit" && onDelete ? (
          <Button variant="ghost" block disabled={busy} onClick={() => setConfirmingDelete(true)}>
            Delete this action
          </Button>
        ) : null}
      </Sheet>

      {confirmingEdit ? (
        <ConfirmDialog
          title="Change recorded history?"
          message="This edits a past betting action and recomputes the pot and standings."
          confirmLabel="Save change"
          onCancel={() => setConfirmingEdit(false)}
          onConfirm={() => {
            setConfirmingEdit(false);
            void submit();
          }}
        />
      ) : null}
      {confirmingDelete && onDelete ? (
        <ConfirmDialog
          title="Delete this action?"
          message="The action is removed and the match is recomputed."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            setBusy(true);
            onDelete().catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "Could not delete");
              setBusy(false);
            });
          }}
        />
      ) : null}
    </>
  );
}
