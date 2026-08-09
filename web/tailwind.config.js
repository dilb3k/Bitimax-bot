/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      // Every colour resolves through a CSS variable defined in globals.css, so a component
      // never hardcodes a value that only works in one theme.
      colors: {
        ground: 'rgb(var(--ground) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        seal: 'rgb(var(--seal) / <alpha-value>)',
        'seal-soft': 'rgb(var(--seal-soft) / <alpha-value>)',
        'seal-ink': 'rgb(var(--seal-ink) / <alpha-value>)',
        vault: 'rgb(var(--vault) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: '14px',
      },
      maxWidth: {
        prose: '68ch',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'none' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        rise: 'rise .5s cubic-bezier(.2,.7,.3,1) both',
      },
    },
  },
  plugins: [],
};
