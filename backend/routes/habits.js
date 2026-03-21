import express from 'express';
import { supabase } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from './activity.js';
import { getTodayWithOffset } from '../utils.js';
import { recomputeDailyProductivity } from '../utils/productivityScore.js';

const router = express.Router();

router.use(requireAuth);

// GET all habits with completion status for today
router.get('/', async (req, res, next) => {
    try {
        const today = await getTodayWithOffset(req.user.id);

        // Get habits for current user
        const { data: habits, error: habitsError } = await supabase
            .from('habits')
            .select('*')
            .eq('user_id', req.user.id)
            .order('id', { ascending: false });

        if (habitsError) throw habitsError;

        if (habits.length === 0) return res.json([]);

        // Get logs for these habits for today
        const habitIds = habits.map(h => h.id);
        const { data: logs, error: logsError } = await supabase
            .from('habit_logs')
            .select('habit_id')
            .in('habit_id', habitIds)
            .eq('date', today);

        if (logsError) throw logsError;

        const completedHabitIds = new Set(logs.map(l => l.habit_id));

        const results = habits.map(h => ({
            ...h,
            completedToday: completedHabitIds.has(h.id) ? 1 : 0
        }));

        res.json(results);
    } catch (err) {
        next(err);
    }
});

// GET habit logs history (past habits)
router.get('/history', async (req, res, next) => {
    try {
        const { data: habits } = await supabase.from('habits').select('id, name, icon, color').eq('user_id', req.user.id);
        if (!habits || habits.length === 0) return res.json([]);
        
        const habitMap = {};
        habits.forEach(h => habitMap[h.id] = h);

        const { data: logs, error } = await supabase
            .from('habit_logs')
            .select('*')
            .in('habit_id', Object.keys(habitMap))
            .order('date', { ascending: false })
            .limit(100);

        if (error) throw error;

        const results = logs.map(log => ({
            ...log,
            habit: habitMap[log.habit_id]
        }));

        res.json(results);
    } catch (err) {
        next(err);
    }
});

// CREATE habit
router.post('/', async (req, res, next) => {
    try {
        const { name, frequency, icon, color } = req.body;

        if (!name) return res.status(400).json({ error: 'Name is required' });

        const { data: newHabit, error } = await supabase
            .from('habits')
            .insert([{
                user_id: req.user.id,
                name,
                frequency: frequency || 'Daily',
                icon: icon || 'Circle',
                color: color || 'var(--accent-color)'
            }])
            .select()
            .single();

        if (error) throw error;
        await recomputeDailyProductivity(req.user.id);
        res.status(201).json(newHabit);
    } catch (err) {
        next(err);
    }
});

// TOGGLE habit for today
router.post('/:id/toggle', async (req, res, next) => {
    try {
        const habitId = req.params.id;
        const today = await getTodayWithOffset(req.user.id);

        // Verify ownership
        const { data: habit, error: authError } = await supabase
            .from('habits')
            .select('id')
            .eq('id', habitId)
            .eq('user_id', req.user.id)
            .single();

        if (authError || !habit) return res.status(404).json({ error: 'Habit not found' });

        // Check if already toggled today
        const { data: existingLog, error: logError } = await supabase
            .from('habit_logs')
            .select('id')
            .eq('habit_id', habitId)
            .eq('date', today)
            .maybeSingle();

        if (existingLog) {
            await supabase.from('habit_logs').delete().eq('id', existingLog.id);
            await recomputeDailyProductivity(req.user.id);
            res.json({ completed: false });
        } else {
            await supabase.from('habit_logs').insert([{ habit_id: habitId, date: today }]);
            // Log for heatmap
            await logActivity(req.user.id, 'HABIT', habitId, 1.0);
            await recomputeDailyProductivity(req.user.id);
            res.json({ completed: true });
        }
    } catch (err) {
        next(err);
    }
});

// DELETE habit
router.delete('/:id', async (req, res, next) => {
    try {
        const { error, count } = await supabase
            .from('habits')
            .delete({ count: 'exactly' })
            .eq('id', req.params.id)
            .eq('user_id', req.user.id);

        if (error || count === 0) return res.status(404).json({ error: 'Habit not found' });
        await recomputeDailyProductivity(req.user.id);
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

export default router;
