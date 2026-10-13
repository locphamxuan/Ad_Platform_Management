import { useSearchParams } from 'react-router-dom';
import { DATE_RANGE_OPTIONS } from './constants';
import { lastNDays } from './format';

/**
 * A filter value kept in the URL, so filtered views survive reloads and can be shared.
 * Values outside `allowed` fall back to the default.
 */
export function useSearchParam<T extends string>(key: string, allowed: readonly T[], fallback: T) {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = allowed.includes(raw as T) ? (raw as T) : fallback;

  const setValue = (next: T) =>
    setParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        if (next === fallback) updated.delete(key);
        else updated.set(key, next);
        return updated;
      },
      { replace: true },
    );

  return [value, setValue] as const;
}

/** Free text kept in the URL (search boxes, drafts handed over from the assistant). */
export function useTextParam(key: string) {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? '';
  const setValue = (next: string) =>
    setParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        if (next) updated.set(key, next);
        else updated.delete(key);
        return updated;
      },
      { replace: true },
    );
  return [value, setValue] as const;
}

/** Shared "last N days" filter; the range is recomputed so it always ends today. */
export function useDateRangeParam() {
  const [days, setDays] = useSearchParam('days', DATE_RANGE_OPTIONS, '7');
  return { days, setDays, range: lastNDays(Number(days)) };
}
