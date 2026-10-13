import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Recommendation } from '../../lib/insights';
import { invalidateCampaignViews } from '../../lib/query-keys';

export interface ApplyOutcome {
  applied: number;
  errors: { campaignName: string; message: string }[];
}

/**
 * Applies assistant recommendations: status changes go through the bulk endpoint (one request per
 * target status), budget changes one campaign at a time. Partial failures are reported, not thrown.
 */
export function useApplyRecommendations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recs: readonly Recommendation[]): Promise<ApplyOutcome> => {
      const names = new Map(recs.map((r) => [r.campaignId, r.campaignName]));
      const outcome: ApplyOutcome = { applied: 0, errors: [] };
      for (const status of ['PAUSED', 'ACTIVE'] as const) {
        const ids = recs.filter((r) => r.action.kind === 'status' && r.action.status === status).map((r) => r.campaignId);
        if (ids.length === 0) continue;
        const result = await api.campaigns.bulkStatus(ids, status);
        outcome.applied += result.updated;
        outcome.errors.push(...result.errors.map((e) => ({ campaignName: names.get(e.campaignId) ?? e.campaignId, message: e.message })));
      }
      for (const rec of recs) {
        if (rec.action.kind !== 'budget') continue;
        try {
          await api.campaigns.update(rec.campaignId, { dailyBudget: rec.action.dailyBudget });
          outcome.applied += 1;
        } catch (error) {
          outcome.errors.push({ campaignName: rec.campaignName, message: error instanceof Error ? error.message : 'Lỗi không xác định' });
        }
      }
      return outcome;
    },
    onSettled: () => invalidateCampaignViews(queryClient),
  });
}
