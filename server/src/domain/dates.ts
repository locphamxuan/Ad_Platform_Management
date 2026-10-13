const DAY_MS = 24 * 60 * 60 * 1000;

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

export const today = () => toIsoDate(new Date());

export const daysAgo = (days: number, from = new Date()) =>
  toIsoDate(new Date(from.getTime() - days * DAY_MS));

const parse = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

/** Every date from `from` to `to`, both included. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let t = parse(from).getTime(); t <= parse(to).getTime(); t += DAY_MS) days.push(toIsoDate(new Date(t)));
  return days;
}

/** The period of the same length that ends the day before `from`. */
export function previousRange(range: { from: string; to: string }): { from: string; to: string } {
  const length = eachDay(range.from, range.to).length;
  const start = parse(range.from);
  return { from: daysAgo(length, start), to: daysAgo(1, start) };
}
