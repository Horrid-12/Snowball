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
import activityRoutes from './routes/activity.js';
import authRoutes from './routes/auth.js';
import habitRoutes from './routes/habits.js';
import youtubeRoutes from './routes/youtube.js';
import notesRoutes from './routes/notes.js';
import friendRoutes from './routes/friends.js';
import { initDB } from './db.js';

// Middleware imports
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { csrfProtection } from './middleware/csrf.js';
import { generalRateLimiter } from './middleware/rateLimit.js';

const getEnv = (name) => {
    const upper = name.toUpperCase();
    for (const key of Object.keys(process.env)) {
        if (key.toUpperCase() === upper) return process.env[key];
    }
    return undefined;
};

const app = express();
const PORT = getEnv('PORT') || 3000;
app.set('trust proxy', process.env.VERCEL ? 1 : false);

const vercelUrl = getEnv('VERCEL_URL')
    ? `https://${getEnv('VERCEL_URL').replace(/^https?:\/\//, '')}`
    : null;

const isProduction = process.env.NODE_ENV === 'production';

const allowedOrigins = new Set([
    getEnv('FRONTEND_URL'),
    vercelUrl,
    'https://snowball-ruddy.vercel.app',
    'capacitor://localhost',
    'https://localhost',
    'https://tauri.localhost',
    'http://tauri.localhost',
    'tauri://localhost',
    // Dev-only HTTP origins
    ...(isProduction ? [] : [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost',
        'http://127.0.0.1',
        'http://10.0.2.2',
        'http://10.0.2.2:5173',
        'http://10.0.3.2',
    ])
].filter(Boolean));

if (!getEnv('JWT_SECRET')) {
    throw new Error('JWT_SECRET environment variable is required.');
}

// --- Core Middleware ---
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
});

app.use(cors({
    origin(origin, callback) {
        // Log origin for debugging if it's missing or non-standard 🔎
        if (!origin || !allowedOrigins.has(origin)) {
            console.log(`[CORS] Incoming origin: ${origin || 'NULL'}`);
        }

        if (!origin || allowedOrigins.has(origin)) {
            return callback(null, true);
        }

        console.error(`[CORS] Blocked origin: ${origin}`);
        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'x-client-id'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
}));

// Apply general rate limiter to all routes except Spotify
// (Spotify has its own API rate limiting, already handled in the route with 429 retry logic)
app.use((req, res, next) => {
    if (req.path.startsWith('/api/spotify')) return next();
    return generalRateLimiter(req, res, next);
});
app.use(csrfProtection);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use((req, res, next) => {
    const origin = req.headers.origin || 'No Origin';
    const auth = req.headers.authorization ? 'Present' : 'Missing';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    // Diagnostic log for potential Android/Tauri issues 🛰️
    if (userAgent.includes('Capacitor') || userAgent.includes('Android') || origin.includes('localhost')) {
        console.log(`[Diagnostic] ${req.method} ${req.url} | Origin: ${origin} | Auth: ${auth}`);
    }
    next();
});
app.use(requestLogger);

// --- API Routes ---
app.use('/api/health', healthRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/spotify', spotifyRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/habits', habitRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/friends', friendRoutes);

// --- Error Handling (must be last) ---
app.use(errorHandler);

const HOST = '0.0.0.0';

// --- Start Server (Only if not on Vercel) ---
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    initDB().then(() => {
        app.listen(PORT, HOST, () => {
            console.log(`\n  ❄️  Snowball backend running at http://${HOST}:${PORT}`);
            console.log(`  📡  Health check: http://127.0.0.1:${PORT}/api/health\n`);
        });
    }).catch(err => {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    });
} else {
    // On Vercel, we just need to ensure DB is initialized
    initDB();
}

export default app;
