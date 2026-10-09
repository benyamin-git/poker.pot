import { useState } from "react";
import type { ChangeEvent } from "react";

interface FileImportButtonProps {
  label: string;
  onPick: (file: File) => void;
}

export function FileImportButton({ label, onPick }: FileImportButtonProps) {
  const [fileName, setFileName] = useState<string | null>(null);

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileName(file.name);
    onPick(file);
  };

  return (
    <>
      <label className="btn btn--tonal btn--block file-import__btn">
        {label}
        <input
          className="visually-hidden"
          type="file"
          accept=".yaml,.yml,application/yaml"
          onChange={pick}
        />
      </label>
      <p className="muted file-import__name" aria-live="polite">
        {fileName ? `${fileName} selected` : null}
      </p>
    </>
  );
}
