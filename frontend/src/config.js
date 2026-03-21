export const API_URL = import.meta.env.PROD
    ? 'https://snowball-ruddy.vercel.app'
    : (import.meta.env.VITE_API_URL || 'https://snowball-ruddy.vercel.app');