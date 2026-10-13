import { describe, expect, it } from 'vitest';
import {
  campaignNameFor,
  generateCreatives,
  parseBrief,
  reviewCreative,
  slugify,
  withUtm,
} from '../src/features/create-campaign/brief';
import type { Objective } from '../src/lib/types';

describe('parseBrief', () => {
  it('pulls budget, discount, occasion and product out of one sentence', () => {
    const brief = parseBrief('Giảm 30% giày chạy bộ nữ dịp 11.11, ngân sách 3 triệu/ngày');
    expect(brief).toEqual({
      product: 'Giày chạy bộ nữ',
      objective: 'sales',
      totalDailyBudget: 3_000_000,
      discount: 30,
      occasion: '11.11',
      landingUrl: undefined,
    });
  });

  it('reads a lead brief with a link and a budget in thousands', () => {
    const brief = parseBrief('Chạy quảng cáo đăng ký tư vấn khoá học IELTS https://bahagroup.vn/ielts 500k/ngày');
    expect(brief.objective).toBe('leads');
    expect(brief.totalDailyBudget).toBe(500_000);
    expect(brief.landingUrl).toBe('https://bahagroup.vn/ielts');
  });

  it('does not read "mùa" as a sale', () => {
    expect(parseBrief('Ra mắt bộ sưu tập mùa đông').objective).toBe('traffic');
  });

  it('reads briefs from any kind of advertiser', () => {
    expect(parseBrief('Giảm 30% gói chăm sóc da dịp 20/10, ngân sách 2 triệu/ngày')).toMatchObject({
      product: 'Gói chăm sóc da',
      objective: 'sales',
      occasion: '20/10',
      totalDailyBudget: 2_000_000,
    });
    expect(parseBrief('Tăng nhận diện thương hiệu cá nhân kênh nấu ăn, 500k/ngày')).toMatchObject({
      objective: 'awareness',
      totalDailyBudget: 500_000,
    });
  });

  it('falls back to a generic product', () => {
    expect(parseBrief('ngân sách 2tr').product).toBe('Sản phẩm nổi bật');
  });
});

describe('generateCreatives', () => {
  it('writes three variants within platform limits for every objective', () => {
    for (const objective of ['sales', 'leads', 'traffic', 'awareness'] as Objective[]) {
      const variants = generateCreatives({ product: 'Giày chạy bộ', objective, discount: 30, occasion: '11.11' });
      expect(variants).toHaveLength(3);
      for (const v of variants) {
        // No invented facts: customer counts, years of experience, hard deadlines.
        expect(`${v.headline} ${v.primaryText}`).not.toMatch(/\d+\.\d{3}|\d+ năm|\d+ giờ/);
        expect(v.headline.length).toBeGreaterThan(0);
        expect(v.headline.length).toBeLessThanOrEqual(100);
        expect(v.primaryText.length).toBeLessThanOrEqual(500);
      }
    }
  });
});

describe('helpers', () => {
  it('slugifies Vietnamese', () => expect(slugify('Giày chạy bộ – 11.11')).toBe('giay-chay-bo-11-11'));

  it('adds UTM tags without overwriting existing ones', () => {
    const url = new URL(withUtm('https://shop.vn/p?utm_source=fb', 'sale'));
    expect(url.searchParams.get('utm_source')).toBe('fb');
    expect(url.searchParams.get('utm_campaign')).toBe('sale');
  });

  it('names campaigns after the occasion or the month', () => {
    const now = new Date(2026, 9, 13);
    expect(campaignNameFor({ product: 'Giày', objective: 'sales', occasion: 'Tết' }, now)).toBe('Tết – Giày');
    expect(campaignNameFor({ product: 'Giày', objective: 'sales' }, now)).toBe('Giày 10/2026');
  });
});

describe('reviewCreative', () => {
  it('scores a complete ad full marks', () => {
    const review = reviewCreative({
      headline: 'Giày chạy bộ giảm đến 30%',
      primaryText: 'Giảm đến 30% cho giày chạy bộ dịp 11.11. Miễn phí giao hàng, đổi trả trong 7 ngày. Đặt ngay hôm nay!',
      landingUrl: 'https://shop.vn/giay?utm_campaign=sale',
    });
    expect(review).toEqual({ score: 100, tips: [] });
  });

  it('explains what is missing', () => {
    const review = reviewCreative({ headline: 'Giày', primaryText: 'Đẹp', landingUrl: 'http://x' });
    expect(review.score).toBe(0);
    expect(review.tips).toHaveLength(6);
  });
});
