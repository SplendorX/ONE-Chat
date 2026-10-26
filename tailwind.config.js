/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // One Chat brand palette
        'warm-white': '#FFFFFF',
        'soft-ivory': '#FAF8F4',
        'oat-beige': '#EDE5D8',
        'sand': '#DCCFBD',
        'espresso': '#302B26',
        'warm-gray': '#857D73',
        'dark-bg': '#171614',
        'dark-surface': '#22201D',
        'dark-elevated': '#2C2925',
        'success-green': '#27845B',
        'error-red': '#C94B45',
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        sans: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        tighter: '-0.03em',
        tight: '-0.02em',
        wide: '0.06em',
        wider: '0.1em',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(48,43,38,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
        'glass-sm': '0 4px 16px rgba(48,43,38,0.06), inset 0 1px 0 rgba(255,255,255,0.50)',
        'card': '0 2px 12px rgba(48,43,38,0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(8px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        pulseSoft: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
      },
    },
  },
  plugins: [],
}

