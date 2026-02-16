/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
      },
      colors: {
        forest: {
          50: '#f0f7f1',
          100: '#dceede',
          200: '#b9ddbf',
          300: '#8ac494',
          400: '#5aa668',
          500: '#3a8a4e',
          600: '#2c6e3e',
          700: '#245834',
          800: '#1e472b',
          900: '#1a3b24',
          950: '#0d2013',
        },
        sidebar: {
          DEFAULT: '#1a2b1e',
          light: '#243828',
        },
        surface: {
          DEFAULT: '#fafaf6',
          warm: '#f5f3ee',
        },
        accent: {
          50: '#fef9ec',
          100: '#fcefc9',
          200: '#f9dd8e',
          300: '#f6c653',
          400: '#f4b12b',
          500: '#ee9413',
          600: '#d2700d',
          700: '#ae500f',
          800: '#8e3f13',
          900: '#753413',
        },
      },
    },
  },
  plugins: [],
}
