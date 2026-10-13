import { describe, expect, it } from 'vitest';
import { describeBatch } from '../src/services/campaign.service.js';

describe('describeBatch', () => {
  it('names a single campaign', () => {
    expect(describeBatch('Tạm dừng', ['Sale 10.10'])).toBe('Tạm dừng chiến dịch "Sale 10.10"');
  });

  it('lists up to three names and counts the rest', () => {
    expect(describeBatch('Xoá', ['A', 'B'])).toBe('Xoá 2 chiến dịch: "A", "B"');
    expect(describeBatch('Bật', ['A', 'B', 'C', 'D', 'E'])).toBe('Bật 5 chiến dịch: "A", "B", "C" và 2 chiến dịch khác');
  });
});
