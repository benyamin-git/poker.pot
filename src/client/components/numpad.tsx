const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"] as const;

const KEY_LABELS: Record<string, string> = { C: "Clear", "⌫": "Backspace" };

export function NumberPad({
  value,
  onChange,
  max,
}: {
  value: number;
  onChange: (value: number) => void;
  max?: number;
}) {
  const press = (key: string) => {
    if (key === "C") {
      onChange(0);
      return;
    }
    if (key === "⌫") {
      const text = String(value);
      const next = text.length <= 1 ? 0 : Number(text.slice(0, -1));
      onChange(next);
      return;
    }
    const text = value === 0 ? key : `${value}${key}`;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return;
    if (max !== undefined && parsed > max) {
      onChange(max);
      return;
    }
    onChange(parsed);
  };

  return (
    <div className="numpad">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="numpad__key"
          aria-label={KEY_LABELS[key] ?? key}
          onClick={() => press(key)}
        >
          {key}
        </button>
      ))}
    </div>
  );
}
