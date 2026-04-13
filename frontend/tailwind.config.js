/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Geist', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        background: '#0B0B0C', // Deep Charcoal/Off-black
        surface: '#161618',    // Card backgrounds
        border: {
          DEFAULT: '#27272A',  // Subtle 1px borders
          focus: '#F3C344',
        },
        primary: {
          DEFAULT: '#F3C344',  // Grandmaster Gold
          dim: 'rgba(243, 195, 68, 0.15)',
        },
        semantic: {
          win: '#10B981',      // Emerald
          loss: '#EF4444',     // Crimson
          draw: '#94A3B8',     // Slate
        }
      },
      letterSpacing: {
        tightest: '-0.02em',
      }
    },
  },
  plugins: [],
}