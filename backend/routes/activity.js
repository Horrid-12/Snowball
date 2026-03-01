import express from 'express';
import { getDB } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// GET aggregated activity for heatmap (last 365 days)
router.get('/heatmap', async (req, res, next) => {
    try {
        const db = getDB();
        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - 365);
        const dateLimitString = dateLimit.toISOString().split('T')[0];

        // Get all activity logs for the last year
        const logs = await db.all('activity_logs', [
            ['user_id', '==', req.user.id],
            ['date', '>=', dateLimitString]
        ]);

        // Aggregate scores by date in memory
        const aggregation = logs.reduce((acc, log) => {
            const date = log.date;
            acc[date] = (acc[date] || 0) + (log.score || 0);
            return acc;
        }, {});

        const result = Object.entries(aggregation).map(([date, totalScore]) => ({
            date,
            totalScore
        })).sort((a, b) => a.date.localeCompare(b.date));

        res.json(result);
    } catch (err) {
        next(err);
    }
});

/**
 * Shared function to log activity
 * Used internally by other routers
 */
export const logActivity = async (userId, type, referenceId, score = 1.0) => {
    try {
        const db = getDB();
        const today = new Date().toISOString().split('T')[0];

        await db.run('activity_logs', {
            user_id: userId,
            type,
            reference_id: referenceId,
            score,
            date: today
        });
    } catch (err) {
        console.error('Failed to log activity:', err);
    }
};

router.post('/log', async (req, res, next) => {
    try {
        const { type, referenceId, score } = req.body;
        await logActivity(req.user.id, type, referenceId, score);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

export default router;
