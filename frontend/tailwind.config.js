/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F1F8E9', 100: '#DCEDC8', 200: '#C5E1A5', 300: '#A5D6A7', 400: '#66BB6A',
          500: '#43A047', 600: '#2E7D32', 700: '#256B29', 800: '#1B5E20', 900: '#124116',
        },
        crema: { 50: '#FFFDF8', 100: '#FAF7EF', 200: '#F1ECDD' },
        ink: { 900: '#263238', 700: '#37474F', 500: '#607D8B', 300: '#B0BEC5' },
        alerta: { 50: '#FFF8E1', 100: '#FFECB3', 500: '#F59E0B', 600: '#D97706', 700: '#B45309' },
        peligro: { 50: '#FFEBEE', 100: '#FFCDD2', 500: '#E53935', 600: '#C62828', 700: '#B71C1C' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(38,50,56,.06), 0 4px 12px rgba(38,50,56,.06)' },
      keyframes: {
        pop: { '0%': { transform: 'scale(.9)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(12px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        flash: { '0%,100%': { backgroundColor: 'transparent' }, '30%': { backgroundColor: '#FFECB3' } },
        stockdown: { '0%': { transform: 'translateY(-6px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },
      animation: {
        pop: 'pop .18s ease-out',
        slideUp: 'slideUp .22s ease-out',
        flash: 'flash 1s ease-out',
        stockdown: 'stockdown .5s ease-out both',
      },
    },
  },
  plugins: [],
};
