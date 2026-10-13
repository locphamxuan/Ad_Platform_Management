const vnd = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

export const formatVnd = (value: number) => `${vnd.format(Math.round(value))}đ`;
export const formatCompactVnd = (value: number) => compact.format(value);
export const formatNumber = (value: number) => vnd.format(value);
export const formatDecimal = (value: number) => decimal.format(value);
export const formatPercent = (value: number) => `${decimal.format(value)}%`;
/** YYYY-MM-DD → DD/MM, read from the string so the day never shifts with the time zone. */
export const formatDate = (isoDate: string) => `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const DAY_MS = 24 * 60 * 60 * 1000;

export const lastNDays = (days: number) => ({
  from: toIsoDate(new Date(Date.now() - (days - 1) * DAY_MS)),
  to: toIsoDate(new Date()),
});

/** The period of the same length that ends the day before `range` starts, for "vs previous" deltas. */
export function previousRange(range: { from: string; to: string }) {
  const from = Date.parse(`${range.from}T00:00:00Z`);
  const length = Math.round((Date.parse(`${range.to}T00:00:00Z`) - from) / DAY_MS) + 1;
  return {
    from: toIsoDate(new Date(from - length * DAY_MS)),
    to: toIsoDate(new Date(from - DAY_MS)),
  };
}
