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
                    dark: '#1F4E78',
                    primary: '#2E75B6',
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
