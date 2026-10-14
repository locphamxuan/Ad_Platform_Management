import { describe, expect, it } from 'vitest';
import { metaAdsManagerUrl, metaPageAdsCenterUrl } from '../src/lib/ads-manager';

describe('ads-manager utilities', () => {
  it('metaAdsManagerUrl builds deep link with accountId and campaignId', () => {
    const url = metaAdsManagerUrl('act_123456', 'meta_camp_789');
    expect(url).toContain('https://adsmanager.facebook.com/adsmanager/manage/campaigns');
    expect(url).toContain('act=123456');
    expect(url).toContain('selected_campaign_ids=meta_camp_789');
  });

  it('metaAdsManagerUrl strips act_ prefix if present', () => {
    const url = metaAdsManagerUrl('act_999888');
    expect(url).toContain('act=999888');
  });

  it('metaPageAdsCenterUrl builds deep link to Facebook Page Ad Center', () => {
    const url = metaPageAdsCenterUrl('page_100200300');
    expect(url).toBe('https://business.facebook.com/latest/ad_center?asset_id=page_100200300');
  });
});
