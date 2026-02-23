/** @type {import('tailwindcss').Config} */
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';

export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './App.tsx',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#00558C',
        'primary-hover': '#00406A',
        'background-light': '#F3F4F6',
        'background-dark': '#000000',
        'surface-light': '#ffffff',
        'surface-dark': '#111111',
      },
      fontFamily: {
        display: ['Questrial', 'sans-serif'],
        body: ['Montserrat', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        xl: '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
    },
  },
  plugins: [forms, typography],
};
