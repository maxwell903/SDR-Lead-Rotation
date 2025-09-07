/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'blue-25': '#f8fafc',
        'green-25': '#f0fdf4',
        'gray-25': '#fafafa',
      }
    },
  },
  plugins: [],
}