import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ErrorMessage, Field, Segmented } from '../../components/ui';
import { api } from '../../lib/api';
import { BUDGET_STEP } from '../../lib/constants';
import { formatVnd } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';

type Mode = 'unlimited' | 'limited';

const MODE_OPTIONS = [
  { value: 'unlimited', label: 'Không giới hạn' },
  { value: 'limited', label: 'Giới hạn' },
] as const;

const SUGGESTED_LIMIT = 10_000_000;

/** Owner-only: caps the daily budget a Media Buyer may set per campaign, or leaves it open. */
export function BudgetLimitCard() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: api.settings.get });
  const current = settings.data?.buyerDailyBudgetLimit ?? null;
  // null draft = follow the saved value until the owner starts editing.
  const [draft, setDraft] = useState<{ mode: Mode; amount: number } | null>(null);
  const mode = draft?.mode ?? (current === null ? 'unlimited' : 'limited');
  const amount = draft?.amount ?? current ?? SUGGESTED_LIMIT;

  const save = useMutation({
    mutationFn: api.settings.update,
    onSuccess: () => {
      setDraft(null);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.activity }),
      ]);
    },
  });

  const next = mode === 'unlimited' ? null : amount;
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({ buyerDailyBudgetLimit: next });
  };

  return (
    <form onSubmit={onSubmit} className="card-pad space-y-4">
      <div>
        <p className="eyebrow">Chủ sở hữu</p>
        <h2 className="mt-1 section-title">Hạn mức ngân sách Media Buyer</h2>
        <p className="mt-1 text-sm text-muted">
          Ngân sách ngày tối đa Media Buyer được đặt cho một chiến dịch. Chủ sở hữu không bị giới hạn.
        </p>
      </div>
      <Segmented
        label="Chế độ hạn mức"
        value={mode}
        options={MODE_OPTIONS}
        onChange={(value) => setDraft({ mode: value, amount })}
      />
      {mode === 'limited' && (
        <Field label="Tối đa mỗi chiến dịch (VND/ngày)" hint="Khi bật, Media Buyer cũng không thể bật hoặc chạy rule tăng ngân sách">
          <input
            className="input tabular-nums"
            type="number"
            inputMode="numeric"
            min={BUDGET_STEP}
            step={BUDGET_STEP}
            required
            value={amount}
            onChange={(e) => setDraft({ mode, amount: Number(e.target.value) })}
          />
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={save.isPending || settings.isLoading || next === current}>
          {save.isPending ? 'Đang lưu…' : 'Lưu hạn mức'}
        </button>
        <span className="text-xs text-muted">
          Hiện tại: {current === null ? 'không giới hạn' : `${formatVnd(current)}/ngày`}
        </span>
      </div>
      <ErrorMessage error={settings.error ?? save.error} />
    </form>
  );
}
