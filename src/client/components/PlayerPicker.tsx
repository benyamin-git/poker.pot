import type { PlayerSnapshot } from "../../domain";
import { IconCheck } from "./icons";

export function PlayerPicker({
  players,
  selected,
  onToggle,
}: {
  players: PlayerSnapshot[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="choice-grid">
      {players.map((player) => {
        const isSelected = selected.includes(player.id);
        return (
          <button
            key={player.id}
            type="button"
            className="choice"
            data-selected={isSelected}
            aria-pressed={isSelected}
            onClick={() => onToggle(player.id)}
          >
            <span>{player.name}</span>
            {isSelected ? <IconCheck size={16} /> : null}
          </button>
        );
      })}
    </div>
  );
}
