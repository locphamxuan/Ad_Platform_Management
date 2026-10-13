import type { QueryClient } from '@tanstack/react-query';

/** Central query keys so mutations can invalidate related views consistently. */
export const queryKeys = {
  integrations: ['integrations'] as const,
  dashboard: (from: string, to: string) => ['dashboard', from, to] as const,
  campaigns: (filter: object) => ['campaigns', filter] as const,
  /** Under 'campaigns' so every campaign change refreshes the open detail page too */
  campaign: (id: string, from: string, to: string) => ['campaigns', 'detail', id, from, to] as const,
  campaignAccounts: (id: string, platform: string) => ['campaigns', 'accounts', id, platform] as const,
  campaignActivity: (id: string) => ['activity', 'campaign', id] as const,
  rules: ['rules'] as const,
  activity: ['activity'] as const,
  users: ['users'] as const,
  settings: ['settings'] as const,
  notifications: ['notifications'] as const,
};

/** Any change to campaigns, rules or integrations affects these views. */
export const invalidateCampaignViews = (queryClient: QueryClient) =>
  Promise.all(
    [['dashboard'], ['campaigns'], ['activity'], ['notifications']].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
