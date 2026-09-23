/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Inter'", "sans-serif"],
      },
      colors: {
        primary: {
          50: '#fbf8ef',
          100: '#f5ecd0',
          200: '#ecd9a2',
          300: '#ddbf6c',
          400: '#cfa63f',
          500: '#bd8f2d',
          600: '#9c7020',
          700: '#7d571d',
          800: '#64461d',
          900: '#533a1c',
          950: '#2f1f0c',
        },
        secondary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        accent: {
          50: '#fdfaf0',
          100: '#f9f0d3',
          200: '#f2e0a3',
          300: '#e9cb6c',
          400: '#dfb544',
          500: '#d19f2a',
          600: '#b47f1c',
          700: '#8f611b',
          800: '#744d1c',
          900: '#61401b',
        },
        success: {
          500: '#22c55e',
        },
        warning: {
          500: '#eab308',
        },
        error: {
          500: '#ef4444',
        },
      },
    },
  },
  plugins: [],
};
