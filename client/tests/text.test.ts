import { describe, expect, it } from 'vitest';
import { AMOUNT_PATTERN, fold, parseVnNumber, readAmount } from '../src/lib/text';

describe('fold', () => {
  it('drops accents and keeps the length so indexes line up', () => {
    const text = 'Giảm 30% Đồ chạy bộ';
    expect(fold(text)).toBe('giam 30% do chay bo');
    expect(fold(text)).toHaveLength(text.length);
  });
});

describe('parseVnNumber', () => {
  it.each([
    ['150.000', 150_000],
    ['1.200.000', 1_200_000],
    ['1,5', 1.5],
    ['2.5', 2.5],
    ['1.200,5', 1200.5],
    ['42', 42],
  ])('%s → %d', (raw, expected) => expect(parseVnNumber(raw)).toBe(expected));
});

describe('AMOUNT_PATTERN', () => {
  const read = (text: string) => {
    const m = new RegExp(AMOUNT_PATTERN).exec(fold(text));
    return m ? readAmount(m[1], m[2]) : null;
  };
  it('reads units', () => {
    expect(read('150k')).toBe(150_000);
    expect(read('1,5 triệu')).toBe(1_500_000);
    expect(read('3tr/ngày')).toBe(3_000_000);
    expect(read('300.000đ')).toBe(300_000);
  });
  it('does not take a following word for a unit', () => {
    expect(read('5 mua')).toBe(5);
  });
});
