/**
 * Health Check Route
 *
 * Returns the current server status and uptime.
 * Used by the frontend to verify backend connectivity.
 */

import { Router } from 'express';

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

export default router;
