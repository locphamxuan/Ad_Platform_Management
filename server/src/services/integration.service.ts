import type { AdAccount, Integration, Platform } from '../domain/types.js';
import { PlatformNotConnectedError } from '../domain/errors.js';
import type { IAdPlatformAdapter } from '../adapters/ad-platform.adapter.js';
import type { PlatformRegistry } from '../adapters/platform-registry.js';
import type { IntegrationRepository } from '../repositories/integration.repository.js';
import type { Actor, ActivityService } from './activity.service.js';

/**
 * A connection made against the simulator does not carry over to the real API (and vice versa):
 * once real credentials are configured, the account must be connected again so it is truly authorised.
 */
const isUsable = (integration: Integration | null | undefined, adapter: IAdPlatformAdapter) =>
  Boolean(integration?.connected) && Boolean(integration?.live) === adapter.live;

export interface ListedAdAccount extends AdAccount {
  /** The account the platform was connected with, which campaigns default to */
  primary: boolean;
}

/** Account lists change rarely; caching them keeps detail pages from calling the platform each time. */
const ACCOUNT_CACHE_MS = 5 * 60 * 1000;

export class IntegrationService {
  private readonly accountCache = new Map<Platform, { at: number; accounts: ListedAdAccount[] }>();

  constructor(
    private readonly integrations: IntegrationRepository,
    private readonly registry: PlatformRegistry,
    private readonly activity: ActivityService,
    private readonly now: () => number = Date.now,
  ) {}

  getAdapter(platform: Platform): IAdPlatformAdapter {
    return this.registry.get(platform);
  }

  /** The account campaigns of this platform run in unless they name another. */
  async defaultAccountId(platform: Platform): Promise<string | undefined> {
    return (await this.integrations.find(platform))?.accountId;
  }

  /**
   * Ad accounts reachable through the platform's connection, primary first; empty when not connected.
   * When the platform cannot list them, the connected account alone is returned.
   */
  async accounts(platform: Platform): Promise<ListedAdAccount[]> {
    const adapter = this.registry.get(platform);
    const integration = await this.integrations.find(platform);
    if (!isUsable(integration, adapter) || !integration?.accountId) return [];
    const cached = this.accountCache.get(platform);
    if (cached && this.now() - cached.at < ACCOUNT_CACHE_MS) return cached.accounts;

    const primaryId = integration.accountId;
    const listed = await adapter.listAdAccounts().catch(() => [] as AdAccount[]);
    const primary: AdAccount = listed.find((a) => a.id === primaryId) ?? {
      id: primaryId,
      name: integration.accountName ?? primaryId,
      active: true,
      spendCap: null,
      amountSpent: null,
    };
    const accounts: ListedAdAccount[] = [
      { ...primary, name: integration.accountName ?? primary.name, primary: true },
      ...listed.filter((a) => a.id !== primaryId).map((a) => ({ ...a, primary: false })),
    ];
    this.accountCache.set(platform, { at: this.now(), accounts });
    return accounts;
  }

  async list() {
    const stored = new Map((await this.integrations.findAll()).map((i) => [i.platform, i]));
    return this.registry.all().map((adapter) => {
      const integration = stored.get(adapter.platform);
      const connected = isUsable(integration, adapter);
      return {
        platform: adapter.platform,
        displayName: adapter.displayName,
        minDailyBudget: adapter.minDailyBudget,
        ...(connected && integration),
        connected,
        live: adapter.live,
      };
    });
  }

  async connect(platform: Platform, actor: Actor) {
    const adapter = this.registry.get(platform);
    const account = await adapter.authorize();
    const integration = await this.integrations.upsert({
      platform,
      connected: true,
      live: adapter.live,
      ...account,
      connectedAt: new Date().toISOString(),
    });
    this.accountCache.delete(platform);
    const mode = adapter.live ? '' : ', giả lập';
    await this.activity.log(actor, `Kết nối ${adapter.displayName} (${account.accountName}${mode})`);
    return integration;
  }

  async disconnect(platform: Platform, actor: Actor) {
    const adapter = this.registry.get(platform);
    const integration = await this.integrations.upsert({ platform, connected: false });
    this.accountCache.delete(platform);
    await this.activity.log(actor, `Ngắt kết nối ${adapter.displayName}`);
    return integration;
  }

  async connectedPlatforms(): Promise<Set<Platform>> {
    const all = await this.integrations.findAll();
    return new Set(all.filter((i) => isUsable(i, this.registry.get(i.platform))).map((i) => i.platform));
  }

  async assertConnected(platform: Platform): Promise<void> {
    const integration = await this.integrations.find(platform);
    if (!isUsable(integration, this.registry.get(platform))) throw new PlatformNotConnectedError(platform);
  }
}
