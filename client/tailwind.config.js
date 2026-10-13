/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
        // Design options only (Playfair Display, SIL Open Font License 1.1, has Vietnamese glyphs).
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      // Colors are CSS variables (index.css) so the light and dark themes share one class list.
      colors: {
        canvas: token('canvas'),
        surface: { DEFAULT: token('surface'), raised: token('surface-raised') },
        ink: { DEFAULT: token('ink'), soft: token('ink-soft') },
        muted: token('muted'),
        subtle: token('subtle'),
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        accent: { DEFAULT: token('accent'), hover: token('accent-hover'), soft: token('accent-soft') },
        spark: { DEFAULT: token('spark'), soft: token('spark-soft') },
        positive: { DEFAULT: token('positive'), soft: token('positive-soft') },
        negative: { DEFAULT: token('negative'), soft: token('negative-soft') },
        caution: { DEFAULT: token('caution'), soft: token('caution-soft') },
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        soft: '0 1px 2px rgb(15 18 30 / 0.04), 0 4px 16px -4px rgb(15 18 30 / 0.08)',
        lift: '0 2px 4px rgb(15 18 30 / 0.05), 0 18px 44px -14px rgb(15 18 30 / 0.22)',
        glow: '0 0 0 1px rgb(var(--accent) / 0.22), 0 10px 32px -10px rgb(var(--spark) / 0.5)',
      },
      backgroundImage: {
        'ai-gradient': 'linear-gradient(135deg, rgb(var(--accent)) 0%, rgb(var(--spark)) 100%)',
        'ai-wash':
          'radial-gradient(900px 320px at 0% 0%, rgb(var(--accent) / 0.09), transparent 60%), radial-gradient(700px 320px at 100% 0%, rgb(var(--spark) / 0.08), transparent 60%)',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'none' } },
        'pulse-dot': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
      animation: {
        shimmer: 'shimmer 2.4s linear infinite',
        'fade-up': 'fade-up 0.3s ease-out both',
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
