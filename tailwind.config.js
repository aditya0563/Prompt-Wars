/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      animation: {
        'spin-glow': 'spin-glow 1s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        'pulse-glow': 'pulse-glow 1.4s infinite ease-in-out both',
        'shimmer': 'shimmer 2s infinite linear',
        'float-in': 'float-in 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
      },
      keyframes: {
        'spin-glow': {
          '0%': { transform: 'rotate(0deg)', filter: 'drop-shadow(0 0 2px rgba(14, 165, 233, 0.5))' },
          '100%': { transform: 'rotate(360deg)', filter: 'drop-shadow(0 0 10px rgba(14, 165, 233, 0.9))' },
        },
        'pulse-glow': {
          '0%, 100%': { transform: 'scale(0.8)', opacity: '0.5', boxShadow: '0 0 0 rgba(14, 165, 233, 0)' },
          '50%': { transform: 'scale(1.2)', opacity: '1', boxShadow: '0 0 8px rgba(14, 165, 233, 0.8)', backgroundColor: '#38bdf8' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'float-in': {
          'from': { opacity: '0', transform: 'translateY(10px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          'from': { opacity: '0', transform: 'translateY(-12px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
