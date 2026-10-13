import { FIT_LOOKBACK_DAYS, rankAccounts, type AccountFit, type AccountHistory } from '../domain/account-fit.js';
import { daysAgo, today } from '../domain/dates.js';
import { sumMetrics, toKpis, type Kpis } from '../domain/metrics.js';
import type { Campaign, MetricDaily, Objective, Platform } from '../domain/types.js';
import type { PlatformRegistry } from '../adapters/platform-registry.js';
import type { CampaignRepository } from '../repositories/campaign.repository.js';
import type { MetricRepository } from '../repositories/metric.repository.js';
import type { IntegrationService, ListedAdAccount } from './integration.service.js';

export interface AccountOption extends ListedAdAccount {
  platform: Platform;
  /** Campaigns AdHub runs in this account, and how many of them are on */
  campaigns: number;
  activeCampaigns: number;
  /** Results of every AdHub campaign in the account over the lookback */
  kpis: Kpis;
  fit: AccountFit;
  /** Where the campaign runs today */
  current: boolean;
  recommended: boolean;
}

export interface AccountAdvice {
  /** Best fit first */
  accounts: AccountOption[];
  recommendedId: string | null;
  lookbackDays: number;
}

export interface PlacementRequest {
  objective: Objective;
  dailyBudget: number;
  /** The campaign being placed, left out of its own account's history; absent for a new campaign */
  campaignId?: string;
  currentAccountId?: string;
}

export interface AccountCount {
  platform: Platform;
  displayName: string;
  total: number;
  active: number;
}

/** Reads each ad account's recent AdHub history and ranks where a campaign should run. */
export class AccountAdvisorService {
  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly metrics: MetricRepository,
    private readonly integrations: IntegrationService,
    private readonly registry: PlatformRegistry,
  ) {}

  async advise(platform: Platform, request: PlacementRequest): Promise<AccountAdvice> {
    const listed = await this.integrations.accounts(platform);
    if (listed.length === 0) return { accounts: [], recommendedId: null, lookbackDays: FIT_LOOKBACK_DAYS };

    const primaryId = listed.find((a) => a.primary)?.id ?? listed[0].id;
    const campaigns = await this.campaigns.findAll({ platform });
    const rows = await this.metrics.findInRange(daysAgo(FIT_LOOKBACK_DAYS - 1), today(), campaigns.map((c) => c.id));
    const accountOf = (c: Campaign) => c.accountId ?? primaryId;
    const rowsOf = (list: readonly Campaign[]) => {
      const ids = new Set(list.map((c) => c.id));
      return rows.filter((r) => ids.has(r.campaignId));
    };

    const sameObjective = campaigns.filter((c) => c.objective === request.objective);
    const benchmarkRows = rowsOf(sameObjective);
    const benchmark = toKpis(sumMetrics(benchmarkRows.length > 0 ? benchmarkRows : rows));

    const candidates = listed.map((account) => {
      const own = campaigns.filter((c) => accountOf(c) === account.id);
      const others = own.filter((c) => c.id !== request.campaignId);
      const otherRows = rowsOf(others);
      const history: AccountHistory = {
        all: toKpis(sumMetrics(otherRows)),
        sameObjective: toKpis(sumMetrics(rowsOf(others.filter((c) => c.objective === request.objective)))),
        activeDays: countActiveDays(otherRows),
        competingCampaigns: others.filter((c) => c.status === 'ACTIVE' && c.objective === request.objective).length,
      };
      return { account, own, history };
    });

    const fits = rankAccounts(candidates, {
      objective: request.objective,
      dailyBudget: request.dailyBudget,
      benchmark,
      currentAccountId: request.currentAccountId,
    });
    const recommendedId = fits.find((f) => f.eligible)?.accountId ?? null;
    const byId = new Map(candidates.map((c) => [c.account.id, c]));

    const accounts = fits.map((fit): AccountOption => {
      const { account, own } = byId.get(fit.accountId)!;
      return {
        ...account,
        platform,
        campaigns: own.length,
        activeCampaigns: own.filter((c) => c.status === 'ACTIVE').length,
        kpis: toKpis(sumMetrics(rowsOf(own))),
        fit,
        current: account.id === request.currentAccountId,
        recommended: account.id === recommendedId,
      };
    });
    return { accounts, recommendedId, lookbackDays: FIT_LOOKBACK_DAYS };
  }

  /** How many ad accounts each connected platform gives access to. */
  async counts(): Promise<AccountCount[]> {
    const connected = await this.integrations.connectedPlatforms();
    const adapters = this.registry.all().filter((a) => connected.has(a.platform));
    return Promise.all(
      adapters.map(async (adapter) => {
        const accounts = await this.integrations.accounts(adapter.platform);
        return {
          platform: adapter.platform,
          displayName: adapter.displayName,
          total: accounts.length,
          active: accounts.filter((a) => a.active).length,
        };
      }),
    );
  }
}

const countActiveDays = (rows: readonly MetricDaily[]) => new Set(rows.filter((r) => r.spend > 0).map((r) => r.date)).size;
