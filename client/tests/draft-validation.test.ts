import { describe, expect, it } from 'vitest';
import {
  validateStep1,
  validateStep2,
  validateStep3,
  validateStep4,
  validateAbStep,
  validateAdvancedStep,
  validateDraftAll,
} from '../src/lib/draft-validation';
import type { CampaignDraftPayload } from '../src/lib/types';

describe('draft-validation', () => {
  const validPayload: CampaignDraftPayload = {
    name: 'Chiến dịch Test 2026',
    objective: 'traffic',
    platforms: ['facebook'],
    specialCategory: 'NONE',
    pages: [{ id: 'page_1', name: 'Baha Fanpage' }],
    creative: {
      headline: 'Tiêu đề quảng cáo hấp dẫn',
      primaryText: 'Nội dung bài viết quảng cáo chi tiết',
      landingUrl: 'https://bahagroup.vn/landing',
      cta: 'LEARN_MORE',
      imageId: 'media_123',
    },
    audience: {
      locations: [{ key: 'hanoi', name: 'Hà Nội', type: 'region' }],
      ageMin: 20,
      ageMax: 50,
      genders: ['MALE', 'FEMALE'],
    },
    acknowledgeNationwide: false,
    totalDailyBudget: 500_000,
    allocations: [{ platform: 'facebook', percentage: 100 }],
    schedule: {
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      endTime: new Date(Date.now() + 86400_000 * 5).toISOString(),
    },
  };

  describe('validateStep1 (Goal & Platforms)', () => {
    it('passes for valid payload', () => {
      const res = validateStep1(validPayload);
      expect(res.valid).toBe(true);
      expect(Object.keys(res.errors)).toHaveLength(0);
    });

    it('fails if name is missing or whitespace', () => {
      const res = validateStep1({ ...validPayload, name: '   ' });
      expect(res.valid).toBe(false);
      expect(res.errors.name).toBeDefined();
    });

    it('fails if platforms array is empty', () => {
      const res = validateStep1({ ...validPayload, platforms: [] });
      expect(res.valid).toBe(false);
      expect(res.errors.platforms).toBeDefined();
    });
  });

  describe('validateStep2 (Content & Pages)', () => {
    it('passes for valid payload', () => {
      const res = validateStep2(validPayload);
      expect(res.valid).toBe(true);
    });

    it('requires at least 1 Facebook page if Facebook is selected', () => {
      const res = validateStep2({ ...validPayload, platforms: ['facebook'], pages: [] });
      expect(res.valid).toBe(false);
      expect(res.errors.pages).toContain('Trang Fanpage');
    });

    it('does not require Facebook page if Facebook is not selected', () => {
      const res = validateStep2({ ...validPayload, platforms: ['google'], pages: [] });
      expect(res.valid).toBe(true);
    });

    it('validates headline presence and length', () => {
      const empty = validateStep2({
        ...validPayload,
        creative: { ...validPayload.creative, headline: '' },
      });
      expect(empty.valid).toBe(false);
      expect(empty.errors.headline).toBeDefined();

      const tooLong = validateStep2({
        ...validPayload,
        creative: { ...validPayload.creative, headline: 'a'.repeat(256) },
      });
      expect(tooLong.valid).toBe(false);
      expect(tooLong.errors.headline).toBeDefined();
    });

    it('validates primaryText presence and length', () => {
      const empty = validateStep2({
        ...validPayload,
        creative: { ...validPayload.creative, primaryText: '' },
      });
      expect(empty.valid).toBe(false);
      expect(empty.errors.primaryText).toBeDefined();

      const tooLong = validateStep2({
        ...validPayload,
        creative: { ...validPayload.creative, primaryText: 'a'.repeat(2001) },
      });
      expect(tooLong.valid).toBe(false);
      expect(tooLong.errors.primaryText).toBeDefined();
    });

    it('validates landingUrl format', () => {
      const res = validateStep2({
        ...validPayload,
        creative: { ...validPayload.creative, landingUrl: 'not-a-valid-url' },
      });
      expect(res.valid).toBe(false);
      expect(res.errors.landingUrl).toBeDefined();
    });
  });

  describe('validateStep3 (Audience & Compliance)', () => {
    it('passes for valid payload', () => {
      const res = validateStep3(validPayload);
      expect(res.valid).toBe(true);
    });

    it('requires location or acknowledgeNationwide', () => {
      const res = validateStep3({
        ...validPayload,
        audience: { ...validPayload.audience!, locations: [] },
        acknowledgeNationwide: false,
      });
      expect(res.valid).toBe(false);
      expect(res.errors.locations).toBeDefined();

      const acknowledged = validateStep3({
        ...validPayload,
        audience: { ...validPayload.audience!, locations: 'VN' },
        acknowledgeNationwide: true,
      });
      expect(acknowledged.valid).toBe(true);
    });

    it('validates age range', () => {
      const under18 = validateStep3({
        ...validPayload,
        audience: { ...validPayload.audience!, ageMin: 16 },
      });
      expect(under18.valid).toBe(false);

      const over65 = validateStep3({
        ...validPayload,
        audience: { ...validPayload.audience!, ageMax: 70 },
      });
      expect(over65.valid).toBe(false);

      const inverted = validateStep3({
        ...validPayload,
        audience: { ...validPayload.audience!, ageMin: 40, ageMax: 30 },
      });
      expect(inverted.valid).toBe(false);
    });

    it('enforces HOUSING restrictions (age 18-65, gender all)', () => {
      const badGender = validateStep3({
        ...validPayload,
        specialCategory: 'HOUSING',
        audience: { ...validPayload.audience!, genders: ['FEMALE'] },
      });
      expect(badGender.valid).toBe(false);
      expect(badGender.errors.genders).toBeDefined();

      const badAge = validateStep3({
        ...validPayload,
        specialCategory: 'HOUSING',
        audience: { ...validPayload.audience!, ageMin: 25, ageMax: 50 },
      });
      expect(badAge.valid).toBe(false);
      expect(badAge.errors.age).toBeDefined();
    });
  });

  describe('validateStep4 (Budget & Schedule)', () => {
    it('passes for valid payload', () => {
      const res = validateStep4(validPayload);
      expect(res.valid).toBe(true);
    });

    it('requires positive budget in 1,000 VND steps', () => {
      const zeroBudget = validateStep4({ ...validPayload, totalDailyBudget: 0 });
      expect(zeroBudget.valid).toBe(false);

      const fractionalBudget = validateStep4({ ...validPayload, totalDailyBudget: 500_500 });
      expect(fractionalBudget.valid).toBe(false);
    });

    it('requires allocation sum to be 100%', () => {
      const badSum = validateStep4({
        ...validPayload,
        platforms: ['facebook', 'google'],
        allocations: [
          { platform: 'facebook', percentage: 50 },
          { platform: 'google', percentage: 40 },
        ],
      });
      expect(badSum.valid).toBe(false);
      expect(badSum.errors.allocations).toBeDefined();
    });

    it('validates schedule end after start', () => {
      const inverted = validateStep4({
        ...validPayload,
        schedule: {
          startTime: new Date(Date.now() + 86400_000 * 2).toISOString(),
          endTime: new Date(Date.now() + 86400_000 * 1).toISOString(),
        },
      });
      expect(inverted.valid).toBe(false);
      expect(inverted.errors.endTime).toBeDefined();
    });
  });

  describe('validateAbStep', () => {
    it('passes if A/B testing is not enabled', () => {
      const res = validateAbStep({ ab_plan: { enabled: false, variable: 'content', variants: [] } });
      expect(res.valid).toBe(true);
    });

    it('validates variable selection and variants when enabled', () => {
      const missingVar = validateAbStep({
        ab_plan: {
          enabled: true,
          variable: '' as any,
          variants: [],
        },
      });
      expect(missingVar.valid).toBe(false);
      expect(missingVar.errors.variable).toBeDefined();

      const validAb = validateAbStep({
        ab_plan: {
          enabled: true,
          variable: 'content',
          variants: [
            { key: 'A', name: 'Variant A', value: {} },
            { key: 'B', name: 'Variant B', value: {} },
          ],
        },
      });
      expect(validAb.valid).toBe(true);
    });
  });

  describe('validateAdvancedStep', () => {
    it('passes for empty or default advanced config', () => {
      const res = validateAdvancedStep({});
      expect(res.valid).toBe(true);
    });

    it('requires bid amount when bid strategy is COST_CAP', () => {
      const res = validateAdvancedStep({
        advanced: {
          bid_strategy: 'COST_CAP',
          bid_amount: 0,
        },
      });
      expect(res.valid).toBe(false);
      expect(res.errors.bid_amount).toBeDefined();
    });

    it('requires placements list when mode is manual', () => {
      const res = validateAdvancedStep({
        placements: {
          mode: 'manual',
          list: [],
        },
      });
      expect(res.valid).toBe(false);
      expect(res.errors.placements).toBeDefined();
    });
  });

  describe('validateDraftAll', () => {
    it('validates all steps together', () => {
      const res = validateDraftAll(validPayload);
      expect(res.valid).toBe(true);

      const resBad = validateDraftAll({
        ...validPayload,
        name: '',
        totalDailyBudget: 0,
      });
      expect(resBad.valid).toBe(false);
      expect(resBad.stepErrors[1]?.name).toBeDefined();
      expect(resBad.stepErrors[4]?.totalDailyBudget).toBeDefined();
    });
  });
});
