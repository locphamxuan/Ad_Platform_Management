import type { Platform } from '../domain/types.js';
import { PlatformNotConnectedError } from '../domain/errors.js';
import type { PlatformRegistry } from '../adapters/platform-registry.js';
import type { IntegrationRepository } from '../repositories/integration.repository.js';
import type { Actor, ActivityService } from './activity.service.js';

export class IntegrationService {
  constructor(
    private readonly integrations: IntegrationRepository,
    private readonly registry: PlatformRegistry,
    private readonly activity: ActivityService,
  ) {}

  async list() {
    const stored = new Map((await this.integrations.findAll()).map((i) => [i.platform, i]));
    return this.registry.all().map((adapter) => ({
      platform: adapter.platform,
      displayName: adapter.displayName,
      minDailyBudget: adapter.minDailyBudget,
      connected: false,
      ...stored.get(adapter.platform),
    }));
  }

  async connect(platform: Platform, actor: Actor) {
    const adapter = this.registry.get(platform);
    const account = await adapter.authorize();
    const integration = await this.integrations.upsert({
      platform,
      connected: true,
      ...account,
      connectedAt: new Date().toISOString(),
    });
    await this.activity.log(actor, `Kết nối ${adapter.displayName} (${account.accountName})`);
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
    return new Set(all.filter((i) => i.connected).map((i) => i.platform));
  }

  async assertConnected(platform: Platform): Promise<void> {
    if (!(await this.integrations.isConnected(platform))) throw new PlatformNotConnectedError(platform);
  }
}
