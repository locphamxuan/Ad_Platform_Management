import { useRef, useState } from 'react';
import { BUDGET_STEP } from '../../lib/constants';
import { formatVnd } from '../../lib/format';

interface BudgetEditorProps {
  /** Accessible name, e.g. which campaign this budget belongs to */
  label: string;
  value: number;
  /** Highest budget this user may set; the server rejects anything above it */
  max?: number;
  disabled?: boolean;
  onSave: (value: number) => void;
}

/** Inline editor: shows the budget, switches to an input on click. Enter saves, Escape cancels. */
export function BudgetEditor({ label, value, max, disabled, onSave }: BudgetEditorProps) {
  const [draft, setDraft] = useState<string | null>(null);
  // Removing the focused input fires blur after Enter/Escape; this keeps that blur from saving again.
  const closed = useRef(false);

  if (disabled) return <span className="tabular-nums">{formatVnd(value)}</span>;

  if (draft === null) {
    return (
      <button
        type="button"
        aria-label={`${label}: ${formatVnd(value)}. Bấm để sửa`}
        className="group inline-flex items-baseline gap-2 rounded-md px-1.5 py-0.5 tabular-nums hover:bg-accent-soft"
        onClick={() => {
          closed.current = false;
          setDraft(String(value));
        }}
      >
        {formatVnd(value)}
        <span className="text-2xs font-medium text-subtle group-hover:text-accent">Sửa</span>
      </button>
    );
  }

  const close = () => {
    closed.current = true;
    setDraft(null);
  };

  const save = () => {
    if (closed.current) return;
    const next = Number(draft);
    if (Number.isInteger(next) && next > 0 && next !== value) onSave(next);
    close();
  };

  return (
    <input
      autoFocus
      aria-label={label}
      type="number"
      inputMode="numeric"
      min={BUDGET_STEP}
      max={max}
      step={BUDGET_STEP}
      title={max ? `Tối đa ${formatVnd(max)}/ngày` : undefined}
      className="input h-8 w-32 text-right tabular-nums"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') close();
      }}
    />
  );
}
