import { useState } from 'react';
import { formatVnd } from '../../lib/format';

interface BudgetEditorProps {
  /** Accessible name, e.g. which campaign this budget belongs to */
  label: string;
  value: number;
  disabled?: boolean;
  onSave: (value: number) => void;
}

/** Inline editor: shows the budget, switches to an input on click. Enter saves, Escape cancels. */
export function BudgetEditor({ label, value, disabled, onSave }: BudgetEditorProps) {
  const [draft, setDraft] = useState<string | null>(null);

  if (disabled) return <span className="tabular-nums">{formatVnd(value)}</span>;

  if (draft === null) {
    return (
      <button
        type="button"
        aria-label={`${label}: ${formatVnd(value)}. Bấm để sửa`}
        className="group inline-flex items-baseline gap-2 rounded-md px-1.5 py-0.5 tabular-nums hover:bg-accent-soft"
        onClick={() => setDraft(String(value))}
      >
        {formatVnd(value)}
        <span className="text-2xs font-medium text-subtle group-hover:text-accent">Sửa</span>
      </button>
    );
  }

  const save = () => {
    const next = Number(draft);
    if (Number.isInteger(next) && next > 0 && next !== value) onSave(next);
    setDraft(null);
  };

  return (
    <input
      autoFocus
      aria-label={label}
      type="number"
      inputMode="numeric"
      min={1}
      step={1000}
      className="input h-8 w-32 text-right tabular-nums"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') setDraft(null);
      }}
    />
  );
}
