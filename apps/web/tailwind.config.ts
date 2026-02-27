/**
 * tailwind.config.ts — OpenEscrow Web Dashboard
 *
 * Tailwind CSS configuration.
 * Handles: content paths for tree-shaking, theme extensions, plugin setup.
 * Does NOT: contain any application logic or import app code.
 *
 * Dependency: tailwindcss — utility-first CSS framework.
 * Why: specified in CLAUDE.md Section E as the styling solution.
 * Bundle cost: only used CSS classes are included (tree-shaken at build time).
 */

import type { Config } from 'tailwindcss';

const config: Config = {
  // Scan all source files for Tailwind classes
  content: [
    './src/**/*.{ts,tsx}',
    // Include node_modules for any packages that export Tailwind classes
    './node_modules/@rainbow-me/rainbowkit/dist/**/*.js',
  ],
  theme: {
    extend: {
      // Custom color tokens matching the app's indigo primary palette
      colors: {
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
      },
      // Slightly wider max content width for the deal detail layout
      maxWidth: {
        '8xl': '88rem',
      },
      // Animation for the loading spinner
      animation: {
        spin: 'spin 1s linear infinite',
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          '"Cascadia Code"',
          '"Source Code Pro"',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
