import { describe, expect, it } from 'vitest';
import { formatDate, formatVnd, lastNDays } from '../src/lib/format';

describe('format', () => {
  it('formats VND with Vietnamese grouping and rounding', () => {
    expect(formatVnd(1_234_567.6)).toBe('1.234.568đ');
  });

  it('never shifts a calendar day across time zones', () => {
    expect(formatDate('2026-01-31')).toBe('31/01');
  });

  it('builds an inclusive range that ends today', () => {
    const { from, to } = lastNDays(7);
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    expect(days).toBe(6);
  });
});
