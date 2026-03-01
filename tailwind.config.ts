import type { Config } from 'tailwindcss';

const config: Config = {
    content: [
        './app/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                sonblade: {
                    dark: '#000000',      // Used for sidebar bg or very deep backgrounds
                    primary: '#000000',   // Primary buttons (Black)
                    gold: '#D4AF37',      // Text, borders, highlights
                    light: '#F8F9FA',
                    success: '#70AD47',
                    warning: '#F39C12',
                    danger: '#E74C3C',
                },
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
        },
    },
    plugins: [],
};

export default config;
