import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Gade Associates brand palette
      colors: {
        brand: {
          DEFAULT: '#1B3A6B', // Deep navy — primary brand colour
          light: '#2A5298',
          muted: '#E8EDF5',
        },
        accent: {
          DEFAULT: '#C4922A', // Gold — firm accent
          light: '#F0C96B',
          muted: '#FBF3E0',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          secondary: '#F7F8FA',
          border: '#E2E6EC',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
