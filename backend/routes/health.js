/**
 * Health Check Route
 *
 * Returns the current server status and uptime.
 * Used by the frontend to verify backend connectivity.
 */

import { Router } from 'express';
import { supabase } from '../db.js';

const router = Router();

/**
 * GET /api/health
 * Returns a JSON object with the server status and uptime in seconds.
 */
router.get('/', (_req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
    });
});

/**
 * GET /api/health/db
 * Tests Supabase connectivity by counting users.
 */
router.get('/db', async (_req, res) => {
    try {
        const { data, error, count } = await supabase
            .from('users')
            .select('id', { count: 'exact', head: true });

        res.json({
            supabase_connected: !error,
            user_count: count,
            error: error ? { message: error.message } : null
        });
    } catch (e) {
        res.json({ supabase_connected: false, error: e.message });
    }
});

export default router;
