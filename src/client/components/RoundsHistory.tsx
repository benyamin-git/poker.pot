import type { DerivedAction, DerivedMatch } from "../../domain";
import { Card } from "./ui";

function roundLabel(index: number): string {
  return index === 0 ? "Preflop" : `Round ${index + 1}`;
}

function actionText(action: DerivedAction): string {
  const allIn = action.allIn ? " · all-in" : "";
  switch (action.type) {
    case "check":
      return `checked${allIn}`;
    case "fold":
      return "folded";
    case "call":
      return `called ${action.added}${allIn}`;
    case "raise":
      return `raised to ${action.roundTotal}${allIn}`;
    default:
      return action.type;
  }
}

export function RoundsHistory({
  derived,
  currency,
  nameOf,
  onEdit,
}: {
  derived: DerivedMatch;
  currency?: string | undefined;
  nameOf: (id: string) => string;
  onEdit?: ((action: DerivedAction) => void) | undefined;
}) {
  if (derived.rounds.length === 0) {
    return (
      <Card layer={1}>
        <p className="muted">No betting rounds recorded yet.</p>
      </Card>
    );
  }

  return (
    <>
      {derived.rounds.map((round) => (
        <Card key={round.index} layer={1}>
          <div className="row">
            <span className="label">{roundLabel(round.index)}</span>
            <div className="spacer" />
            <span className="muted">
              Pot {round.potAtEnd}
              {currency ? ` ${currency}` : ""}
            </span>
          </div>
          <div className="stack">
            {round.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="stat-row history-action"
                disabled={!onEdit}
                onClick={() => onEdit?.(action)}
              >
                <span className="stat-row__name">{nameOf(action.playerId)}</span>
                <span className="stat-row__value">{actionText(action)}</span>
              </button>
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}
