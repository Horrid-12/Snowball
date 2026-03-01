import express from 'express';
import { getDB } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from './activity.js';

const router = express.Router();

router.use(requireAuth);

// GET all habits with completion status for today
router.get('/', async (req, res, next) => {
    try {
        const db = getDB();
        const today = new Date().toISOString().split('T')[0];

        // Get all user habits
        const habits = await db.all('habits', [['user_id', '==', req.user.id]]);

        // Get all logs for today for these habits
        const logs = await db.all('habit_logs', [['date', '==', today]]);
        const loggedHabitIds = new Set(logs.map(l => l.habit_id));

        const habitsWithStatus = habits.map(h => ({
            ...h,
            completedToday: loggedHabitIds.has(h.id) ? 1 : 0
        }));

        res.json(habitsWithStatus);
    } catch (err) {
        next(err);
    }
});

// CREATE habit
router.post('/', async (req, res, next) => {
    try {
        const db = getDB();
        const { name, frequency, icon, color } = req.body;

        if (!name) return res.status(400).json({ error: 'Name is required' });

        const data = {
            user_id: req.user.id,
            name,
            frequency: frequency || 'Daily',
            icon: icon || 'Circle',
            color: color || 'var(--accent-color)',
            streak: 0
        };

        const result = await db.run('habits', data);
        res.status(201).json({ id: result.lastID, ...data });
    } catch (err) {
        next(err);
    }
});

// TOGGLE habit for today
router.post('/:id/toggle', async (req, res, next) => {
    try {
        const db = getDB();
        const habitId = req.params.id;
        const today = new Date().toISOString().split('T')[0];

        // Verify ownership
        const habit = await db.get('habits', [['id', '==', habitId], ['user_id', '==', req.user.id]]);
        if (!habit) return res.status(404).json({ error: 'Habit not found' });

        const existingLog = await db.get('habit_logs', [['habit_id', '==', habitId], ['date', '==', today]]);

        if (existingLog) {
            await db.delete('habit_logs', existingLog.id);
            res.json({ completed: false });
        } else {
            await db.run('habit_logs', { habit_id: habitId, date: today });
            // Log for heatmap
            await logActivity(req.user.id, 'HABIT', habitId, 1.0);
            res.json({ completed: true });
        }
    } catch (err) {
        next(err);
    }
});

// DELETE habit
router.delete('/:id', async (req, res, next) => {
    try {
        const db = getDB();
        await db.delete('habits', req.params.id);
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

export default router;
