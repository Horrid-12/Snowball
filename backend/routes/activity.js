import express from 'express';
import { supabase as serviceDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const getDb = (req) => req?.anonDb || serviceDb;
import { getTodayWithOffset, getPastDateWithOffset } from '../utils.js';
import { backfillDailyProductivity } from '../utils/productivityScore.js';

const router = express.Router();

router.use(requireAuth);

// GET aggregated activity for heatmap (last 365 days)
router.get('/heatmap', async (req, res, next) => {
    try {
        const startDate = await getPastDateWithOffset(req.user.id, 365);
        await backfillDailyProductivity(req.user.id);

        const { data: snapshots, error } = await getDb(req)
            .from('daily_productivity')
            .select('date, score')
            .eq('user_id', req.user.id)
            .gte('date', startDate)
            .order('date', { ascending: true });

        if (error) throw error;

        const results = (snapshots || []).map(snapshot => ({
            date: snapshot.date,
            totalScore: snapshot.score || 0
        }));

        res.json(results);
    } catch (err) {
        next(err);
    }
});

// GET paginated activity history 
router.get('/history', async (req, res, next) => {
    try {
        await backfillDailyProductivity(req.user.id);

        const { data: snapshots, error } = await getDb(req)
            .from('daily_productivity')
            .select('*')
            .eq('user_id', req.user.id)
            .order('date', { ascending: false })
            .limit(100);

        if (error) throw error;
        res.json((snapshots || []).map(snapshot => ({
            id: `${snapshot.user_id}-${snapshot.date}`,
            date: snapshot.date,
            score: snapshot.score || 0,
            tasks: snapshot.tasks_completed || 0,
            habits: snapshot.habits_completed || 0,
            tasksAllocated: snapshot.tasks_allocated || 0,
            tasksCompleted: snapshot.tasks_completed || 0,
            hoursAllocated: snapshot.hours_allocated || 0,
            hoursTaken: snapshot.hours_taken || 0,
            habitsAllocated: snapshot.habits_allocated || 0,
            habitsCompleted: snapshot.habits_completed || 0
        })));
    } catch (err) {
        next(err);
    }
});

router.post('/backfill', async (req, res, next) => {
    try {
        const result = await backfillDailyProductivity(req.user.id);
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
});

// GET lifetime stats for XP calculation
router.get('/stats', async (req, res, next) => {
    try {
        // Total tasks completed (fully allocated)
        const { data: tasks, error: tasksError } = await getDb(req)
            .from('tasks')
            .select('tasks_completed, tasks_allocated')
            .eq('user_id', req.user.id);

        if (tasksError) throw tasksError;
        const completedTasks = (tasks || []).filter((task) => {
            const allocated = Number(task?.tasks_allocated || 0);
            const completed = Number(task?.tasks_completed || 0);
            return allocated > 0 && completed >= allocated;
        }).length;

        // Total habit logs
        const { data: userHabits, error: fetchHabitsError } = await getDb(req)
            .from('habits')
            .select('id')
            .eq('user_id', req.user.id);

        if (fetchHabitsError) throw fetchHabitsError;

        const habitIds = (userHabits || []).map(h => h.id);
        
        let completedHabits = 0;
        if (habitIds.length > 0) {
            const { count, error: habitsError } = await getDb(req)
                .from('habit_logs')
                .select('id', { count: 'exact', head: true })
                .in('habit_id', habitIds);
            
            if (habitsError) throw habitsError;
            completedHabits = count || 0;
        }

        // Total activity score
        const { data: logs, error: logsError } = await getDb(req)
            .from('activity_logs')
            .select('score')
            .eq('user_id', req.user.id);

        if (logsError) throw logsError;

        const totalScore = logs.reduce((sum, log) => sum + (log.score || 0), 0);

        res.json({
            completedTasks,
            completedHabits: completedHabits || 0,
            totalActivityScore: totalScore
        });
    } catch (err) {
        next(err);
    }
});

/**
 * Shared function to log activity
 */
export const logActivity = async (userId, type, referenceId, score = 1.0) => {
    try {
        const today = await getTodayWithOffset(userId);

        await serviceDb
            .from('activity_logs')
            .insert([{
                user_id: userId,
                type,
                reference_id: referenceId,
                score,
                date: today
            }]);
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
