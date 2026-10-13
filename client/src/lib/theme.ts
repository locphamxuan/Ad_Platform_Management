import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'adhub.theme';

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/** The saved choice, else the operating system's preference. */
export function initialTheme(): Theme {
  return storedTheme() ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0A0B12' : '#F6F7FB');
}

const readColor = (name: string) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()})`;

const readChartColors = () => ({
  line: readColor('line'),
  lineStrong: readColor('line-strong'),
  muted: readColor('muted'),
  surface: readColor('surface'),
  ink: readColor('ink'),
  accent: readColor('accent'),
});

/**
 * Theme colors as plain strings for chart libraries, which set SVG attributes where CSS variables
 * do not resolve. Re-reads them whenever the theme switches.
 */
export function useChartColors() {
  const [colors, setColors] = useState(readChartColors);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readChartColors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return colors;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => applyTheme(theme), [theme]);
  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // storage blocked: the choice lasts for this page only
      }
      return next;
    });
  }, []);
  return { theme, toggle };
}
