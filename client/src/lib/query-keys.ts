import type { QueryClient } from '@tanstack/react-query';

/** Central query keys so mutations can invalidate related views consistently. */
export const queryKeys = {
  integrations: ['integrations'] as const,
  dashboard: (from: string, to: string) => ['dashboard', from, to] as const,
  campaigns: (filter: object) => ['campaigns', filter] as const,
  rules: ['rules'] as const,
  activity: ['activity'] as const,
  users: ['users'] as const,
  settings: ['settings'] as const,
};

/** Any change to campaigns, rules or integrations affects these views. */
export const invalidateCampaignViews = (queryClient: QueryClient) =>
  Promise.all(
    [['dashboard'], ['campaigns'], ['activity']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
