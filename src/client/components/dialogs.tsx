import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "./ui";

function DialogShell({ children }: { children: ReactNode }) {
  return (
    <dialog open className="dialog" aria-modal="true">
      <div className="dialog__panel">{children}</div>
    </dialog>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <DialogShell>
      <h2 className="title">{title}</h2>
      <div className="muted">{message}</div>
      <div className="row">
        <Button variant="ghost" block onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? "danger" : "primary"} block onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </DialogShell>
  );
}

export function TypedConfirmDialog({
  title,
  message,
  phrase,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  phrase: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const matches = typed.trim() === phrase;
  return (
    <DialogShell>
      <h2 className="title">{title}</h2>
      <div className="muted">{message}</div>
      <p className="muted">
        Type <strong>{phrase}</strong> to confirm.
      </p>
      <input
        ref={inputRef}
        className="text-input"
        value={typed}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => setTyped(event.target.value)}
        placeholder={phrase}
      />
      <div className="row">
        <Button variant="ghost" block onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" block disabled={!matches} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </DialogShell>
  );
}
