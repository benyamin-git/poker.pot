import type { PlayerSnapshot } from "../../domain";

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
            onClick={() => onToggle(player.id)}
          >
            {player.name}
          </button>
        );
      })}
    </div>
  );
}
