const DAY_MS = 24 * 60 * 60 * 1000;

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

export const today = () => toIsoDate(new Date());

export const daysAgo = (days: number, from = new Date()) =>
  toIsoDate(new Date(from.getTime() - days * DAY_MS));
