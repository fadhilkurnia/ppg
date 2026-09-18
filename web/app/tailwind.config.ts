import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUpSheet: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        slideDownSheet: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(100%)' },
        },
        modalScale: {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(24px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        modalScaleOut: {
          '0%': { opacity: '1', transform: 'scale(1) translateY(0)' },
          '100%': { opacity: '0', transform: 'scale(0.96) translateY(24px)' },
        },
        dropdownIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        dropdownOut: {
          '0%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.95)' },
        },
        bounceShort: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.08)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-out': 'fadeOut 200ms ease-in forwards',
        'scale-in': 'scaleIn 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-up': 'slideUp 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-up-sheet': 'slideUpSheet 320ms cubic-bezier(0.32, 0.72, 0, 1) forwards',
        'slide-down-sheet': 'slideDownSheet 250ms cubic-bezier(0.32, 0.72, 0, 1) forwards',
        'modal-scale': 'modalScale 260ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'modal-scale-out': 'modalScaleOut 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'dropdown-in': 'dropdownIn 150ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'dropdown-out': 'dropdownOut 120ms ease-in forwards',
        'bounce-short': 'bounceShort 300ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config
