/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
        // Design options only (Playfair Display, SIL Open Font License 1.1, has Vietnamese glyphs).
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      colors: {
        canvas: '#F5F4F0',
        surface: '#FFFFFF',
        ink: { DEFAULT: '#16181D', soft: '#2A2D35' },
        muted: '#6A6E76',
        subtle: '#9A9DA3',
        line: { DEFAULT: '#E4E2DC', strong: '#CFCCC4' },
        accent: { DEFAULT: '#2D47D9', hover: '#2238B8', soft: '#ECEFFC' },
        positive: { DEFAULT: '#137A4B', soft: '#E6F4EC' },
        negative: { DEFAULT: '#B42318', soft: '#FDECEA' },
        caution: { DEFAULT: '#9A5B05', soft: '#FDF3E2' },
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
};
