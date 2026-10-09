import type {
  ActivityLog,
  AuthUser,
  Campaign,
  CampaignStatus,
  CreateUnifiedCampaignInput,
  DashboardSummary,
  Integration,
  NewRule,
  NewUser,
  Platform,
  PlatformPublishResult,
  Role,
  Rule,
  RuleRunResult,
  User,
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

const TOKEN_KEY = 'adhub.token';

/** Storage can throw (private mode, blocked cookies); the app then works per tab only. */
export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore: see above
    }
  },
};

let onUnauthorized: () => void = () => {};
/** Lets the auth layer react when the server says the session is gone. */
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = tokenStore.get();
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized();
    throw new ApiError(body.code ?? 'HTTP_ERROR', body.message ?? response.statusText, response.status);
  }
  return body as T;
}

const post = <T>(path: string, data?: unknown) =>
  request<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) });
const patch = <T>(path: string, data: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(data) });

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
      post<{ token: string; user: AuthUser }>('/auth/login', { email, password }),
    me: () => request<AuthUser>('/auth/me'),
    logout: () => post<void>('/auth/logout'),
  },
  users: {
    list: () => request<User[]>('/users'),
    create: (user: NewUser) => post<User>('/users', user),
    update: (id: string, changes: { name?: string; role?: Role; active?: boolean }) =>
      patch<User>(`/users/${id}`, changes),
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
