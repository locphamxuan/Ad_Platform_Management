import type {
  ActivityLog,
  AuthUser,
  BulkStatusResult,
  Campaign,
  CampaignStatus,
  CreateUnifiedCampaignInput,
  DashboardSummary,
  Integration,
  NewRule,
  NewUser,
  Platform,
  PlatformPublishResult,
  ProfileChanges,
  Role,
  Rule,
  RuleRunResult,
  User,
  WorkspaceSettings,
} from './types';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/**
 * The session lives in an httpOnly cookie the page cannot read. Its companion CSRF cookie is
 * readable: echoing it in X-CSRF-Token proves the request comes from this site.
 */
const CSRF_COOKIE = 'adhub_csrf';

function csrfToken(): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : null;
}

/** Cheap hint used on startup: without the CSRF cookie there is no session worth checking. */
export const hasSessionCookie = () => csrfToken() !== null;

// Sessions used to be kept in localStorage; drop any leftover token.
try {
  localStorage.removeItem('adhub.token');
} catch {
  // storage blocked: nothing to clean up
}

let onUnauthorized: () => void = () => {};
/** Lets the auth layer react when the server says the session is gone. */
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const csrf = csrfToken();
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf && { 'X-CSRF-Token': csrf }),
    },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && csrf) onUnauthorized();
    throw new ApiError(body.code ?? 'HTTP_ERROR', body.message ?? response.statusText, response.status);
  }
  return body as T;
}

const post = <T>(path: string, data?: unknown) =>
  request<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) });
const patch = <T>(path: string, data: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(data) });
const put = <T>(path: string, data: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(data) });

const toQuery = (params: Record<string, string | undefined>) => {
  const entries = Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]));
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

interface DateRange {
  from: string;
  to: string;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      post<{ user: AuthUser }>('/auth/login', { email, password }),
    me: () => request<AuthUser>('/auth/me'),
    updateProfile: (changes: ProfileChanges) => patch<AuthUser>('/auth/me', changes),
    changePassword: (currentPassword: string, newPassword: string) =>
      post<void>('/auth/me/password', { currentPassword, newPassword }),
    logout: () => post<void>('/auth/logout'),
  },
  users: {
    list: () => request<User[]>('/users'),
    create: (user: NewUser) => post<User>('/users', user),
    update: (id: string, changes: { name?: string; role?: Role; active?: boolean }) =>
      patch<User>(`/users/${id}`, changes),
  },
  settings: {
    get: () => request<WorkspaceSettings>('/settings'),
    update: (changes: Pick<WorkspaceSettings, 'buyerDailyBudgetLimit'>) => put<WorkspaceSettings>('/settings', changes),
  },
  integrations: {
    list: () => request<Integration[]>('/integrations'),
    connect: (platform: Platform) => post<Integration>(`/integrations/${platform}/connect`),
    disconnect: (platform: Platform) => post<Integration>(`/integrations/${platform}/disconnect`),
  },
  dashboard: {
    summary: (range: DateRange) => request<DashboardSummary>(`/dashboard${toQuery({ ...range })}`),
  },
  campaigns: {
    list: (filter: DateRange & { platform?: Platform; status?: CampaignStatus }) =>
      request<Campaign[]>(`/campaigns${toQuery({ ...filter })}`),
    update: (id: string, changes: { status?: CampaignStatus; dailyBudget?: number }) =>
      patch<Campaign>(`/campaigns/${id}`, changes),
    bulkStatus: (ids: string[], status: CampaignStatus) =>
      post<BulkStatusResult>('/campaigns/bulk-status', { ids, status }),
    createUnified: (input: CreateUnifiedCampaignInput) =>
      post<{ unifiedCampaignId: string; results: PlatformPublishResult[] }>('/campaigns/unified', input),
  },
  rules: {
    list: () => request<Rule[]>('/rules'),
    create: (rule: NewRule) => post<Rule>('/rules', rule),
    setEnabled: (id: string, enabled: boolean) => patch<Rule>(`/rules/${id}`, { enabled }),
    remove: (id: string) => request<void>(`/rules/${id}`, { method: 'DELETE' }),
    run: (id: string) => post<RuleRunResult>(`/rules/${id}/run`),
  },
  activity: {
    list: () => request<ActivityLog[]>('/activity'),
  },
};
