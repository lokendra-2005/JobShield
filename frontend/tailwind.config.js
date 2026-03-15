/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                cyber: {
                    black: '#0a0a0a',
                    dark: '#0f0f0f',
                    card: '#141414',
                    border: '#2a0a0a',
                    red: '#ef4444',
                    'red-bright': '#ff2222',
                    'red-dark': '#7f1d1d',
                    'red-glow': '#dc2626',
                    'red-dim': '#991b1b',
                    gray: '#374151',
                    'gray-light': '#6b7280',
                    white: '#f9fafb',
                }
            },
            fontFamily: {
                cyber: ['Orbitron', 'monospace'],
                body: ['Inter', 'sans-serif'],
            },
            backgroundImage: {
                'cyber-gradient': 'radial-gradient(ellipse at top left, #1f0000 0%, #0a0a0a 50%, #0f0000 100%)',
                'card-gradient': 'linear-gradient(135deg, rgba(30,10,10,0.8) 0%, rgba(15,5,5,0.9) 100%)',
                'button-gradient': 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                'hero-gradient': 'radial-gradient(ellipse at center, #1a0000 0%, #0a0a0a 70%)',
            },
            boxShadow: {
                'cyber-red': '0 0 20px rgba(239,68,68,0.3), 0 0 40px rgba(239,68,68,0.1)',
                'cyber-red-intense': '0 0 30px rgba(239,68,68,0.5), 0 0 60px rgba(239,68,68,0.2)',
                'cyber-card': '0 8px 32px rgba(0,0,0,0.8), 0 0 20px rgba(239,68,68,0.1)',
                'cyber-button': '0 0 15px rgba(239,68,68,0.4), 0 4px 15px rgba(0,0,0,0.5)',
                'inner-glow': 'inset 0 0 20px rgba(239,68,68,0.05)',
            },
            animation: {
                'pulse-red': 'pulse-red 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'float': 'float 4s ease-in-out infinite',
                'shimmer': 'shimmer 2s linear infinite',
                'scan-line': 'scan-line 3s linear infinite',
                'particle': 'particle 8s linear infinite',
                'counter': 'counter 2s ease-out forwards',
                'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
            },
            keyframes: {
                'pulse-red': {
                    '0%, 100%': { opacity: '1', boxShadow: '0 0 15px rgba(239,68,68,0.4)' },
                    '50%': { opacity: '0.8', boxShadow: '0 0 30px rgba(239,68,68,0.7)' },
                },
                'float': {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-12px)' },
                },
                'shimmer': {
                    '0%': { backgroundPosition: '-200% center' },
                    '100%': { backgroundPosition: '200% center' },
                },
                'scan-line': {
                    '0%': { transform: 'translateY(-100%)' },
                    '100%': { transform: 'translateY(100vh)' },
                },
                'glow-pulse': {
                    '0%, 100%': { opacity: '0.5' },
                    '50%': { opacity: '1' },
                },
            },
            backdropBlur: {
                xs: '2px',
            },
        },
    },
    plugins: [],
}
