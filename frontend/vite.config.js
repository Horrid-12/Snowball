import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    define: {
        __API_URL__: JSON.stringify(process.env.VITE_API_URL || 'http://127.0.0.1:3000')
    }
})
