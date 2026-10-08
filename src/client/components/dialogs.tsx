import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Button } from "./ui";
import { useFocusTrap } from "./useFocusTrap";

function DialogShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useFocusTrap<HTMLDialogElement>(true, onClose);
  return (
    <dialog ref={panelRef} open className="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="dialog__panel">
        <h2 className="title" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
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
    <DialogShell title={title} onClose={onCancel}>
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
    <DialogShell title={title} onClose={onCancel}>
      <div className="muted">{message}</div>
      <div className="stack">
        <label className="label" htmlFor="confirmPhrase">
          Type {phrase} to confirm
        </label>
        <input
          id="confirmPhrase"
          ref={inputRef}
          className="text-input"
          value={typed}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={phrase}
        />
      </div>
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
