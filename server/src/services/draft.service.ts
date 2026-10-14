import { randomUUID } from 'node:crypto';
import type {
  Campaign,
  CampaignDraft,
  CampaignDraftPayload,
  CampaignDraftState,
  CheckLevelResult,
  Creative,
  PublicUser,
  User,
} from '../domain/types.js';
import { AppError, ConflictError, ForbiddenError, ValidationError } from '../domain/errors.js';
import { assertDailyBudgetAllowed } from '../domain/permissions.js';
import { allocateBudget } from '../domain/budget.js';
import type { CampaignDraftRepository } from '../repositories/campaign-draft.repository.js';
import type { CampaignRepository } from '../repositories/campaign.repository.js';
import type { MediaService } from './media.service.js';
import type { PlatformRegistry } from '../adapters/platform-registry.js';
import type { IntegrationService } from './integration.service.js';
import type { AccountAdvisorService } from './account-advisor.service.js';
import type { Actor, ActivityService } from './activity.service.js';
import type { SettingsService } from './settings.service.js';

export type DraftPayloadInput = Partial<Omit<CampaignDraftPayload, 'creative'>> & {
  creative?: Partial<Creative>;
};

export interface CreateDraftInput {
  step?: number;
  payload: DraftPayloadInput;
}

export interface UpdateDraftInput {
  revision: number;
  step?: number;
  payload?: DraftPayloadInput;
}

export class DraftService {
  constructor(
    private readonly draftRepo: CampaignDraftRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly mediaService: MediaService,
    private readonly registry: PlatformRegistry,
    private readonly integrations: IntegrationService,
    private readonly advisor: AccountAdvisorService,
    private readonly settings: SettingsService,
    private readonly activity: ActivityService,
  ) {}

  async listDrafts(user: PublicUser | User): Promise<CampaignDraft[]> {
    if (user.role === 'owner') {
      return this.draftRepo.findAll();
    }
    return this.draftRepo.findByOwner(user.id);
  }

  async getDraft(id: string, user: PublicUser | User): Promise<CampaignDraft> {
    const draft = await this.draftRepo.getById(id);
    this.assertAccess(draft, user);
    return draft;
  }

  async createDraft(userId: string, input: CreateDraftInput): Promise<CampaignDraft> {
    const now = new Date().toISOString();
    const defaultPayload: CampaignDraftPayload = {
      name: input.payload.name || 'Chiến dịch mới',
      objective: input.payload.objective || 'traffic',
      platforms: input.payload.platforms && input.payload.platforms.length > 0 ? input.payload.platforms : ['facebook'],
      totalDailyBudget: input.payload.totalDailyBudget || 100_000,
      allocations: input.payload.allocations || [{ platform: 'facebook', percentage: 100 }],
      creative: {
        headline: input.payload.creative?.headline ?? '',
        primaryText: input.payload.creative?.primaryText ?? '',
        landingUrl: input.payload.creative?.landingUrl ?? 'https://',
        cta: input.payload.creative?.cta,
        imageId: input.payload.creative?.imageId,
      },
      pages: input.payload.pages || [],
      audience: input.payload.audience || { locations: 'VN', ageMin: 18, ageMax: 65, genders: ['MALE', 'FEMALE'] },
      schedule: input.payload.schedule || {},
      specialCategory: input.payload.specialCategory || 'NONE',
      accountId: input.payload.accountId,
      acknowledgeNationwide: input.payload.acknowledgeNationwide,
    };

    const draft: CampaignDraft = {
      id: randomUUID(),
      ownerId: userId,
      revision: 1,
      state: 'DRAFT',
      step: input.step ?? 1,
      payload: defaultPayload,
      createdAt: now,
      updatedAt: now,
    };

    return this.draftRepo.insert(draft);
  }

  async updateDraft(id: string, user: PublicUser | User, input: UpdateDraftInput): Promise<CampaignDraft> {
    const current = await this.draftRepo.getById(id);
    this.assertAccess(current, user);

    if (current.state === 'SUBMITTING') {
      throw new ConflictError('Bản nháp đang trong quá trình tạo trên nền tảng');
    }
    if (current.state === 'SUBMITTED') {
      throw new ConflictError('Chiến dịch đã tạo thành công, không thể chỉnh sửa bản nháp này');
    }

    const mergedPayload: CampaignDraftPayload = {
      ...current.payload,
      ...(input.payload || {}),
      creative: {
        ...current.payload.creative,
        ...(input.payload?.creative || {}),
      },
      audience: {
        ...current.payload.audience,
        ...(input.payload?.audience || {}),
      },
      schedule: {
        ...current.payload.schedule,
        ...(input.payload?.schedule || {}),
      },
    };

    const updated = await this.draftRepo.updateWithRevision(id, input.revision, {
      step: input.step ?? current.step,
      payload: mergedPayload,
      check: undefined, // Edits invalidate prior validation check results
    });

    if (!updated) {
      throw new ConflictError('Nháp đã được sửa ở nơi khác — vui lòng tải lại');
    }

    return updated;
  }

  async deleteDraft(id: string, user: PublicUser | User): Promise<void> {
    const draft = await this.draftRepo.getById(id);
    this.assertAccess(draft, user);

    if (draft.state === 'SUBMITTING') {
      throw new ConflictError('Không thể xoá bản nháp đang trong tiến trình tạo');
    }

    await this.draftRepo.delete(id);
  }

  /**
   * Runs 4-level validation for the draft.
   */
  async check(id: string, user: PublicUser | User): Promise<CheckLevelResult[]> {
    const draft = await this.getDraft(id, user);
    const results: CheckLevelResult[] = [];

    for (const platform of draft.payload.platforms) {
      await this.integrations.assertConnected(platform);
      const adapter = this.registry.get(platform);

      if (adapter.validateCampaign) {
        let image: { id: string; buffer: Buffer; fileName: string; mimeType: string } | undefined;
        if (draft.payload.creative.imageId) {
          try {
            const asset = await this.mediaService.getById(draft.payload.creative.imageId);
            const { data } = await this.mediaService.getImageBuffer(asset.id);
            image = { id: asset.id, buffer: data, fileName: asset.fileName, mimeType: asset.mimeType };
          } catch {
            // Missing image will be reported in validation
          }
        }

        const platformResults = await adapter.validateCampaign({
          name: draft.payload.name,
          objective: draft.payload.objective,
          dailyBudget: draft.payload.totalDailyBudget,
          creative: draft.payload.creative,
          accountId: draft.payload.accountId,
          pages: draft.payload.pages,
          audience: draft.payload.audience,
          schedule: draft.payload.schedule,
          specialCategory: draft.payload.specialCategory,
          image,
        });

        results.push(...platformResults);
      } else {
        // Fallback for platforms without validate_only
        results.push({ level: 'CAMPAIGN', status: 'PASSED' });
        results.push({ level: 'AD_SET', status: 'PASSED' });
        results.push({ level: 'AD_CREATIVE', status: 'PASSED' });
        results.push({ level: 'AD', status: 'PASSED' });
      }
    }

    // Save check results linked to the current revision
    await this.draftRepo.update(id, {
      check: {
        revision: draft.revision,
        at: new Date().toISOString(),
        levels: results,
      },
    });

    return results;
  }

  /**
   * Generates ad previews for all selected pages across placements.
   */
  async previews(id: string, user: PublicUser | User): Promise<Record<string, Array<{ placement: string; iframeHtml?: string; fallback?: boolean }>>> {
    const draft = await this.getDraft(id, user);
    const pages = draft.payload.pages && draft.payload.pages.length > 0
      ? draft.payload.pages
      : [{ id: 'default', name: 'Trang mặc định' }];

    const adapter = this.registry.get('facebook');
    const result: Record<string, Array<{ placement: string; iframeHtml?: string; fallback?: boolean }>> = {};

    for (const page of pages) {
      const placements = ['DESKTOP_FEED_STANDARD', 'MOBILE_FEED_STANDARD'];
      if (page.hasInstagram) {
        placements.push('INSTAGRAM_STANDARD');
      }

      const pagePreviews = [];
      for (const placement of placements) {
        if (adapter.previewAd) {
          const preview = await adapter.previewAd({
            pageId: page.id,
            creative: draft.payload.creative,
            adFormat: placement,
          });
          pagePreviews.push({ placement, ...preview });
        } else {
          pagePreviews.push({ placement, fallback: true });
        }
      }
      result[page.id] = pagePreviews;
    }

    return result;
  }

  /**
   * Submits draft: locks atomically, builds campaign on platform, saves Campaign in AdHub.
   */
  async submit(id: string, user: PublicUser | User, actor: Actor): Promise<Campaign> {
    const draft = await this.getDraft(id, user);

    if (draft.state === 'SUBMITTING') {
      throw new ConflictError('Bản nháp đang được tạo trên nền tảng');
    }
    if (draft.state === 'SUBMITTED') {
      throw new ConflictError('Chiến dịch đã được tạo');
    }

    // 1. Validate permissions
    const limit = await this.settings.budgetLimitFor(user.role);
    const budgetAllocations = draft.payload.allocations.map((a) => ({
      platform: a.platform,
      percent: a.percent ?? a.percentage ?? 100,
    }));
    const allocations = allocateBudget(draft.payload.totalDailyBudget, budgetAllocations);
    for (const { dailyBudget } of allocations) {
      assertDailyBudgetAllowed(user.role, limit, dailyBudget);
    }

    // 2. Validate schedule
    if (draft.payload.schedule.startTime) {
      const start = new Date(draft.payload.schedule.startTime).getTime();
      // Allow up to 2 minutes clock skew
      if (start < Date.now() - 2 * 60 * 1000) {
        throw new ValidationError('Thời gian bắt đầu không được ở trong quá khứ');
      }
    }
    if (draft.payload.schedule.startTime && draft.payload.schedule.endTime) {
      const start = new Date(draft.payload.schedule.startTime).getTime();
      const end = new Date(draft.payload.schedule.endTime).getTime();
      if (end <= start) {
        throw new ValidationError('Thời gian kết thúc phải sau thời gian bắt đầu');
      }
      if (end - start < 24 * 60 * 60 * 1000) {
        throw new ValidationError('Thời gian chạy chiến dịch phải tối thiểu 24 giờ');
      }
    }

    // 3. Validate pages for Facebook
    if (draft.payload.platforms.includes('facebook') && (!draft.payload.pages || draft.payload.pages.length === 0)) {
      throw new ValidationError('Vui lòng chọn ít nhất 1 Trang để tạo quảng cáo Facebook');
    }

    const tag = randomUUID().slice(0, 8);
    const idempotencyKey = randomUUID();

    // 4. Atomic lock: transition to SUBMITTING
    const locked = await this.draftRepo.updateState(id, draft.state, 'SUBMITTING', {
      submission: {
        idempotencyKey,
        tag,
        startedAt: new Date().toISOString(),
      },
    });

    if (!locked) {
      throw new ConflictError('Bản nháp đang được gửi hoặc đã thay đổi trạng thái');
    }

    let createdCampaign: Campaign | null = null;

    try {
      // Create on each platform
      for (const { platform, dailyBudget } of allocations) {
        await this.integrations.assertConnected(platform);
        const adapter = this.registry.get(platform);

        let image: { id: string; buffer: Buffer; fileName: string; mimeType: string; metaHash?: string } | undefined;
        if (draft.payload.creative.imageId) {
          const asset = await this.mediaService.getById(draft.payload.creative.imageId);
          const { data } = await this.mediaService.getImageBuffer(asset.id);
          const accountId = draft.payload.accountId || 'default';
          image = {
            id: asset.id,
            buffer: data,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
            metaHash: asset.metaHashes?.[accountId],
          };
        }

        const advice = await this.advisor.advise(platform, { objective: draft.payload.objective, dailyBudget }).catch(() => null);
        const best = advice?.accounts.find((a) => a.recommended);
        const accountId = draft.payload.accountId || best?.id;

        const result = await adapter.createCampaign({
          name: draft.payload.name,
          objective: draft.payload.objective,
          dailyBudget,
          creative: draft.payload.creative,
          accountId,
          pages: draft.payload.pages,
          audience: draft.payload.audience,
          schedule: draft.payload.schedule,
          specialCategory: draft.payload.specialCategory,
          idempotencyTag: tag,
          image,
        });

        const campaignId = randomUUID();
        const campaign = await this.campaignRepo.insert({
          id: campaignId,
          platform,
          externalId: result.externalId,
          name: draft.payload.name,
          objective: draft.payload.objective,
          platformObjective: result.platformObjective,
          status: 'PAUSED', // R2
          dailyBudget,
          creative: draft.payload.creative,
          accountId,
          pages: draft.payload.pages,
          audience: draft.payload.audience,
          schedule: draft.payload.schedule,
          specialCategory: draft.payload.specialCategory,
          draftId: draft.id,
          meta: result.meta ? { ...result.meta, syncedAt: new Date().toISOString() } : undefined,
          createdAt: new Date().toISOString(),
        });

        createdCampaign = campaign;
      }

      // Mark SUBMITTED
      await this.draftRepo.update(id, {
        state: 'SUBMITTED',
        submission: {
          idempotencyKey,
          tag,
          startedAt: locked.submission!.startedAt,
          results: {
            campaignId: createdCampaign!.id,
          },
        },
      });

      await this.activity.log(
        actor,
        `Tạo chiến dịch "${draft.payload.name}" trên Meta (Tạm dừng)`,
        createdCampaign!.id,
      );

      return createdCampaign!;
    } catch (err) {
      const error = err as AppError;
      const isReconcile = error.code === 'NEEDS_RECONCILE';
      const isUncertain = error.message?.includes('timeout') || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET';

      const newState: CampaignDraftState = isReconcile
        ? 'NEEDS_RECONCILE'
        : isUncertain
          ? 'UNCERTAIN'
          : 'FAILED';

      await this.draftRepo.update(id, {
        state: newState,
        submission: {
          idempotencyKey,
          tag,
          startedAt: locked.submission!.startedAt,
          error: {
            message: error.message || 'Lỗi không xác định khi tạo chiến dịch',
          },
        },
      });

      throw error;
    }
  }

  /**
   * Reconciles uncertain draft against platform.
   */
  async reconcile(id: string, user: PublicUser | User): Promise<CampaignDraft> {
    const draft = await this.getDraft(id, user);
    if (draft.state !== 'UNCERTAIN' && draft.state !== 'NEEDS_RECONCILE') {
      return draft;
    }

    const tag = draft.submission?.tag;
    if (!tag) {
      return this.draftRepo.update(id, { state: 'FAILED' });
    }

    const adapter = this.registry.get('facebook');
    if (!adapter.findByTag) {
      return this.draftRepo.update(id, { state: 'FAILED' });
    }

    const found = await adapter.findByTag(tag, draft.payload.accountId);
    if (!found) {
      // Nothing was created on Meta, safely mark as FAILED so user can retry
      return this.draftRepo.update(id, { state: 'FAILED' });
    }

    // Found campaign on Meta: read back and save
    if (adapter.readBack) {
      const verified = await adapter.readBack(found.campaignId);
      if (verified && verified.status === 'PAUSED') {
        const campaign = await this.campaignRepo.insert({
          id: randomUUID(),
          platform: 'facebook',
          externalId: found.campaignId,
          name: draft.payload.name,
          objective: draft.payload.objective,
          platformObjective: adapter.mapObjective(draft.payload.objective),
          status: 'PAUSED',
          dailyBudget: draft.payload.totalDailyBudget,
          creative: draft.payload.creative,
          accountId: draft.payload.accountId,
          pages: draft.payload.pages,
          audience: draft.payload.audience,
          schedule: draft.payload.schedule,
          specialCategory: draft.payload.specialCategory,
          draftId: draft.id,
          createdAt: new Date().toISOString(),
        });

        return this.draftRepo.update(id, {
          state: 'SUBMITTED',
          submission: {
            ...draft.submission!,
            results: { campaignId: campaign.id },
          },
        });
      }
    }

    return this.draftRepo.update(id, { state: 'NEEDS_REVIEW' });
  }

  /**
   * Clones an existing campaign into a new draft in DRAFT state.
   */
  async cloneFromCampaign(campaignId: string, user: PublicUser | User): Promise<CampaignDraft> {
    const campaign = await this.campaignRepo.getById(campaignId);

    const payload: CampaignDraftPayload = {
      name: `${campaign.name} (Bản sao)`,
      objective: campaign.objective,
      platforms: [campaign.platform],
      totalDailyBudget: campaign.dailyBudget,
      allocations: [{ platform: campaign.platform, percentage: 100 }],
      creative: campaign.creative || { headline: '', primaryText: '', landingUrl: 'https://' },
      pages: campaign.pages || [],
      audience: campaign.audience || { locations: 'VN', ageMin: 18, ageMax: 65, genders: ['MALE', 'FEMALE'] },
      schedule: campaign.schedule || {},
      specialCategory: campaign.specialCategory || 'NONE',
      accountId: campaign.accountId,
    };

    return this.createDraft(user.id, { step: 1, payload });
  }

  /**
   * Sweeps drafts stuck in SUBMITTING state for longer than thresholdMinutes (5 mins).
   */
  async sweepStuckDrafts(thresholdMinutes = 5): Promise<number> {
    const stuck = await this.draftRepo.findStuckSubmitting(thresholdMinutes);
    for (const draft of stuck) {
      await this.draftRepo.update(draft.id, {
        state: 'UNCERTAIN',
        submission: {
          ...draft.submission!,
          error: { message: 'Tiến trình gửi bị gián đoạn (quá thời gian chờ). Vui lòng đối chiếu với Meta.' },
        },
      });
    }
    return stuck.length;
  }

  private assertAccess(draft: CampaignDraft, user: PublicUser | User) {
    if (user.role === 'client') {
      throw new ForbiddenError('Tài khoản khách hàng không có quyền truy cập bản nháp chiến dịch');
    }
    if (user.role !== 'owner' && draft.ownerId !== user.id) {
      throw new ForbiddenError('Bạn không có quyền truy cập bản nháp này');
    }
  }
}

