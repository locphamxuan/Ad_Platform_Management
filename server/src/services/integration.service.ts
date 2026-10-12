import type { Integration, Platform } from '../domain/types.js';
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

export class IntegrationService {
  constructor(
    private readonly integrations: IntegrationRepository,
    private readonly registry: PlatformRegistry,
    private readonly activity: ActivityService,
  ) {}

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
    const mode = adapter.live ? '' : ', giả lập';
    await this.activity.log(actor, `Kết nối ${adapter.displayName} (${account.accountName}${mode})`);
    return integration;
  }

  async disconnect(platform: Platform, actor: Actor) {
    const adapter = this.registry.get(platform);
    const integration = await this.integrations.upsert({ platform, connected: false });
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
