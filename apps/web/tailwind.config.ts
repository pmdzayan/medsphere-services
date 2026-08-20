import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral surface/ink hierarchy, consolidated from the arbitrary hex
        // values already scattered across apps/web (see Task 1 governance
        // note) rather than invented. Keep these in sync with the CSS custom
        // properties of the same intent in globals.css.
        canvas: {
          50: '#fbfdfc',
          100: '#fbfcfb',
          200: '#edf1ef',
          300: '#dce5e1',
          400: '#dfe7e3',
          500: '#93a09c',
          600: '#71817c',
          700: '#536a62',
          800: '#38544b',
          900: '#1b372d',
        },
        ink: {
          700: '#10271f',
          800: '#173128',
          900: '#10201c',
        },
        emerald: {
          50: '#ecfdf7',
          100: '#d3f7e8',
          200: '#a7efd1',
          300: '#6fe0b6',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047a56',
          800: '#0b2f28',
          900: '#07110f',
          950: '#022c22',
        },
        cyan: {
          50: '#eefbfd',
          100: '#d3f4f8',
          200: '#a7e9f1',
          300: '#75dae9',
          400: '#43d3e5',
          500: '#22b8cc',
          600: '#1594a6',
          700: '#127786',
        },
        champagne: {
          400: '#e6c987',
          500: '#d7b56d',
          600: '#b89450',
        },
      },
      boxShadow: {
        panel: '0 24px 70px -32px rgba(2, 44, 34, 0.35)',
        premium: '0 35px 100px -42px rgba(7, 17, 15, 0.72)',
        card: '0 14px 40px rgba(24, 57, 47, .05)',
        'card-lg': '0 18px 60px rgba(24, 57, 47, .06)',
      },
    },
  },
  plugins: [],
};

export default config;
