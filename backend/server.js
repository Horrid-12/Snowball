/**
 * Snowball — Express Server Entry Point
 *
 * Initialises the Express application, mounts middleware and routes,
 * and starts listening on the configured port. Environment variables
 * are loaded from a .env file via dotenv.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import healthRoutes from './routes/health.js';
import taskRoutes from './routes/tasks.js';
import spotifyRoutes from './routes/spotify.js';
import authRoutes from './routes/auth.js';
import habitRoutes from './routes/habits.js';
import youtubeRoutes from './routes/youtube.js';
import { initDB } from './db.js';

// Middleware imports
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';

const app = express();
const PORT = process.env.PORT || 3000;

// --- Core Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// --- API Routes ---
app.use('/api/health', healthRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/spotify', spotifyRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/habits', habitRoutes);
app.use('/api/youtube', youtubeRoutes);

// --- Error Handling (must be last) ---
app.use(errorHandler);

const HOST = '0.0.0.0';

// --- Start Server ---
initDB().then(() => {
    app.listen(PORT, HOST, () => {
        console.log(`\n  ❄️  Snowball backend running at http://${HOST}:${PORT}`);
        console.log(`  📡  Health check: http://127.0.0.1:${PORT}/api/health\n`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});

export default app;

VITE_API_URL=https://snowball-unee.onrender.com
