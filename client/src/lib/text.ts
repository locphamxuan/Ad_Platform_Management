/**
 * Helpers for reading short Vietnamese instructions typed by users, with or without accents.
 */

/**
 * Lower-case, accent-free copy of `text` with the SAME length, so a match found in the folded
 * text can be cut out of the original at the same indexes. "Giảm 30%" → "giam 30%".
 */
export function fold(text: string): string {
  let out = '';
  for (const ch of text) {
    const base = ch.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace('đ', 'd');
    // Keep one output unit per input unit; a lone combining mark becomes a space.
    out += base.length === ch.length ? base : base.length === 0 ? ' '.repeat(ch.length) : base.slice(0, ch.length).padEnd(ch.length);
  }
  return out;
}

const UNIT_FACTOR: Record<string, number> = {
  k: 1_000,
  nghin: 1_000,
  ngan: 1_000,
  tr: 1_000_000,
  trieu: 1_000_000,
  m: 1_000_000,
  ty: 1_000_000_000,
};

/**
 * "150.000" → 150000, "1,5" → 1.5, "2.5" → 2.5, "1.200,5" → 1200.5. Vietnamese writes "." for
 * thousands and "," for decimals; a separator followed by exactly three digits is read as thousands.
 */
export function parseVnNumber(raw: string): number {
  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    const decimal = Math.max(lastDot, lastComma);
    const integer = raw.slice(0, decimal).replace(/[.,]/g, '');
    return Number(`${integer}.${raw.slice(decimal + 1)}`);
  }
  const sep = lastDot !== -1 ? '.' : lastComma !== -1 ? ',' : null;
  if (sep === null) return Number(raw);
  const groups = raw.split(sep);
  const thousands = groups.length > 2 || groups[groups.length - 1].length === 3;
  return thousands ? Number(groups.join('')) : Number(groups.join('.'));
}

/**
 * Amount with an optional unit as typed: "150k", "1,5 triệu", "2tr", "300.000đ". Groups: number,
 * unit. A unit must not run into another word ("5 mua" is not 5 million), except a trailing "đ".
 */
export const AMOUNT_PATTERN = String.raw`(?<![\d.,])(\d+(?:[.,]\d+)*)(?:\s*(k|nghin|ngan|trieu|tr|ty|m)(?![a-ce-z]))?`;

export function readAmount(number: string, unit: string | undefined): number {
  return parseVnNumber(number) * (unit ? (UNIT_FACTOR[unit] ?? 1) : 1);
}
