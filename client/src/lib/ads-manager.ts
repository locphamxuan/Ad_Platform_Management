/**
 * Builds a direct deep-link into Meta Ads Manager for the specific campaign.
 * This satisfies Rule R3, prompting users to activate their campaigns directly on Meta.
 */
export function metaAdsManagerUrl(accountId?: string, campaignId?: string): string {
  const cleanAccount = accountId ? accountId.replace(/^act_/, '') : undefined;
  if (cleanAccount && campaignId) {
    return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${cleanAccount}&selected_campaign_ids=${campaignId}`;
  }
  if (cleanAccount) {
    return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${cleanAccount}`;
  }
  return 'https://adsmanager.facebook.com/adsmanager/manage/campaigns';
}

/**
 * Builds direct deep-link to Meta Business Suite / Page Ads Center for page review.
 */
export function metaPageAdsCenterUrl(pageId: string): string {
  return `https://business.facebook.com/latest/ad_center?asset_id=${pageId}`;
}

