/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Inter', 'sans-serif']
      },
      colors: {
        slatebrand: '#1E2A2F',
        signal: '#2A7FAA',
        surface: '#F4F6F9',
        ink: '#0D1417',
        ok: '#1FA971',
        warn: '#D9912B',
        danger: '#D14B4B'
      },
      boxShadow: {
        soft: '0 18px 45px rgba(30, 42, 47, 0.10)',
        glow: '0 20px 50px rgba(42, 127, 170, 0.25)'
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem'
      }
    }
  },
  plugins: []
};
