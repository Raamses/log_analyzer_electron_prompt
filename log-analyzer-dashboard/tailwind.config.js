import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
        colors: {
            'background': '#0D1117',
            'foreground': '#E6EDF3',
            'card': '#FFFFFF',
            'card-foreground': '#0D1117',
            'primary': '#2F81F7',
            'primary-foreground': '#FFFFFF',
            'secondary': '#30363D',
            'secondary-foreground': '#C9D1D9',
            'accent': '#1F6FEB',
            'accent-foreground': '#FFFFFF',
            'destructive': '#DA3633',
            'destructive-foreground': '#FFFFFF',
            'success': '#2DA44E',
            'success-foreground': '#FFFFFF',
            'warning': '#DBAB0A',
            'warning-foreground': '#FFFFFF',
            'muted': '#848D97',
            'muted-foreground': '#848D97',
            'border': '#30363D',
        },
        fontFamily: {
            sans: ['Inter', ...defaultTheme.fontFamily.sans],
        },
    },
  },
  plugins: [],
}