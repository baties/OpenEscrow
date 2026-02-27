/**
 * postcss.config.mjs — OpenEscrow Web Dashboard
 *
 * PostCSS configuration for Tailwind CSS processing.
 * Handles: running Tailwind and autoprefixer over CSS files.
 * Does NOT: configure any application logic or import app code.
 *
 * Dependency: postcss — CSS transformer (required by tailwindcss).
 * Dependency: autoprefixer — adds vendor prefixes to CSS.
 */

/** @type {import('postcss').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
