import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#09131a',
        canvas: '#f4f8f7',
        emerald: {
          50: '#ecfdf7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          950: '#022c22',
        },
      },
      boxShadow: {
        panel: '0 24px 70px -32px rgba(2, 44, 34, 0.35)',
        premium: '0 35px 100px -42px rgba(7, 17, 15, 0.72)',
      },
    },
  },
  plugins: [],
};

export default config;
