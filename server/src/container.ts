import type { Db } from 'mongodb';
import { MockAdPlatformAdapter } from './adapters/mock/mock-ad-platform.adapter.js';
import { PLATFORM_PROFILES } from './adapters/mock/platform-profiles.js';
import { PlatformRegistry } from './adapters/platform-registry.js';
import { ActivityRepository } from './repositories/activity.repository.js';
import { CampaignRepository } from './repositories/campaign.repository.js';
import { IntegrationRepository } from './repositories/integration.repository.js';
import { MetricRepository } from './repositories/metric.repository.js';
import { RuleRepository } from './repositories/rule.repository.js';
import { SessionRepository } from './repositories/session.repository.js';
import { SettingsRepository } from './repositories/settings.repository.js';
import { UserRepository } from './repositories/user.repository.js';
import { ActivityService } from './services/activity.service.js';
import { AuthService } from './services/auth.service.js';
import { CampaignService } from './services/campaign.service.js';
import { DashboardService } from './services/dashboard.service.js';
import { IntegrationService } from './services/integration.service.js';
import { RuleEngineService } from './services/rule-engine.service.js';
import { SettingsService } from './services/settings.service.js';
import { SyncService } from './services/sync.service.js';
import { UnifiedCampaignService } from './services/unified-campaign.service.js';
import { UserService } from './services/user.service.js';

/** Composition root: the only place that knows concrete implementations. */
export function createContainer(db: Db) {
  const registry = new PlatformRegistry();
  for (const profile of Object.values(PLATFORM_PROFILES)) {
    registry.register(new MockAdPlatformAdapter(profile));
  }

  const repositories = {
    integrations: new IntegrationRepository(db),
    campaigns: new CampaignRepository(db),
    metrics: new MetricRepository(db),
    rules: new RuleRepository(db),
    activities: new ActivityRepository(db),
    users: new UserRepository(db),
    sessions: new SessionRepository(db),
    settings: new SettingsRepository(db),
  };

  const activity = new ActivityService(repositories.activities);
  const integrations = new IntegrationService(repositories.integrations, registry, activity);
  const campaigns = new CampaignService(
    repositories.campaigns,
    repositories.metrics,
    registry,
    integrations,
    activity,
  );

  return {
    repositories,
    activity,
    auth: new AuthService(repositories.users, repositories.sessions),
    users: new UserService(repositories.users, repositories.sessions, activity),
    settings: new SettingsService(repositories.settings, activity),
    integrations,
    campaigns,
    dashboard: new DashboardService(repositories.campaigns, repositories.metrics, registry, integrations),
    unifiedCampaigns: new UnifiedCampaignService(registry, integrations, repositories.campaigns, activity),
    rules: new RuleEngineService(
      repositories.rules,
      repositories.campaigns,
      campaigns,
      integrations,
      registry,
      activity,
    ),
    sync: new SyncService(repositories.campaigns, repositories.metrics, registry, integrations),
  };
}

export type Container = ReturnType<typeof createContainer>;
