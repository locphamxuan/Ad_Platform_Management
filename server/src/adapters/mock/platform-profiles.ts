import type { Platform } from '../../domain/types.js';
import type { MockPlatformProfile } from './mock-ad-platform.adapter.js';

export const PLATFORM_PROFILES: Record<Platform, MockPlatformProfile> = {
  facebook: {
    platform: 'facebook',
    displayName: 'Facebook Ads',
    externalIdPrefix: 'fb',
    minDailyBudget: 25_000,
    objectiveMap: {
      awareness: 'OUTCOME_AWARENESS',
      traffic: 'OUTCOME_TRAFFIC',
      engagement: 'OUTCOME_ENGAGEMENT',
      leads: 'OUTCOME_LEADS',
      app_promotion: 'OUTCOME_APP_PROMOTION',
      sales: 'OUTCOME_SALES',
    },
    cpm: 45_000,
    ctr: 0.014,
    conversionRate: 0.035,
    avgOrderValue: 450_000,
  },
  tiktok: {
    platform: 'tiktok',
    displayName: 'TikTok Ads',
    externalIdPrefix: 'tt',
    minDailyBudget: 50_000,
    objectiveMap: {
      awareness: 'REACH',
      traffic: 'TRAFFIC',
      engagement: 'VIDEO_VIEWS',
      leads: 'LEAD_GENERATION',
      app_promotion: 'APP_PROMOTION',
      sales: 'PRODUCT_SALES',
    },
    cpm: 30_000,
    ctr: 0.011,
    conversionRate: 0.025,
    avgOrderValue: 350_000,
  },
  google: {
    platform: 'google',
    displayName: 'Google Ads',
    externalIdPrefix: 'gg',
    minDailyBudget: 20_000,
    objectiveMap: {
      awareness: 'DISPLAY',
      traffic: 'SEARCH',
      engagement: 'VIDEO',
      leads: 'SEARCH',
      app_promotion: 'APP_CAMPAIGN',
      sales: 'PERFORMANCE_MAX',
    },
    cpm: 70_000,
    ctr: 0.035,
    conversionRate: 0.045,
    avgOrderValue: 500_000,
  },
};
