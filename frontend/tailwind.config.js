/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        background: '#0A0A0A',
        surface: '#121212',
        'surface-hover': '#1A1A1A',
        primary: {
          DEFAULT: '#D92D20',
          hover: '#B91C1C',
        },
        'text-primary': '#FFFFFF',
        'text-secondary': '#A3A3A3',
        border: '#262626',
        success: '#10B981',
        warning: '#F59E0B',
      },
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        body: ['Manrope', 'sans-serif'],
      },
      borderRadius: {
        none: '0',
        sm: '2px',
      },
    },
  },
  plugins: [],
};
