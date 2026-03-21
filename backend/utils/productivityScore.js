import { supabase } from '../db.js';
import { getTodayWithOffset } from '../utils.js';

export const calculateProductivityScore = (tasks = [], habits = []) => {
    const totals = tasks.reduce(
        (acc, task) => {
            acc.tasksAllocated += task.tasks_allocated || 0;
            acc.tasksCompleted += task.tasks_completed || 0;
            acc.hoursAllocated += task.hours_allocated || 0;
            acc.hoursTaken += task.hours_taken || 0;
            return acc;
        },
        { tasksAllocated: 0, tasksCompleted: 0, hoursAllocated: 0, hoursTaken: 0 }
    );

    const habitsAllocated = habits.length;
    const habitsCompleted = habits.filter(habit => habit.completedToday).length;

    let score = 0;

    if (totals.tasksAllocated !== 0 || habitsAllocated !== 0) {
        const taskRatio = totals.tasksAllocated > 0 ? totals.tasksCompleted / totals.tasksAllocated : 0;
        const habitRatio = habitsAllocated > 0 ? habitsCompleted / habitsAllocated : 0;

        let baseProductivity = 0;

        if (totals.tasksAllocated > 0 && habitsAllocated > 0) {
            baseProductivity = (taskRatio * 0.6) + (habitRatio * 0.4);
        } else if (totals.tasksAllocated > 0) {
            baseProductivity = taskRatio;
        } else if (habitsAllocated > 0) {
            baseProductivity = habitRatio;
        }

        let performanceAdjustment = 1.0;
        if (totals.hoursTaken > 0 && totals.hoursAllocated > 0) {
            performanceAdjustment = totals.hoursAllocated / totals.hoursTaken;
            performanceAdjustment = Math.min(1.5, Math.max(0.5, performanceAdjustment));
        }

        score = baseProductivity * performanceAdjustment;
    }

    return {
        score: Number((score * 100).toFixed(1)),
        totals,
        habitsAllocated,
        habitsCompleted
    };
};

const fetchActiveTasks = async (userId) => {
    let { data: tasks, error } = await supabase
        .from('tasks')
        .select('tasks_allocated, tasks_completed, hours_allocated, hours_taken')
        .eq('user_id', userId)
        .or('is_archived.eq.false,is_archived.is.null');

    if (error && error.code === '42703') {
        const fallback = await supabase
            .from('tasks')
            .select('tasks_allocated, tasks_completed, hours_allocated, hours_taken')
            .eq('user_id', userId);
        tasks = fallback.data;
        error = fallback.error;
    }

    if (error) throw error;
    return tasks || [];
};

const fetchHabitsWithTodayStatus = async (userId, today) => {
    const { data: habits, error: habitsError } = await supabase
        .from('habits')
        .select('id')
        .eq('user_id', userId);

    if (habitsError) throw habitsError;
    if (!habits || habits.length === 0) return [];

    const habitIds = habits.map(habit => habit.id);
    const { data: logs, error: logsError } = await supabase
        .from('habit_logs')
        .select('habit_id')
        .in('habit_id', habitIds)
        .eq('date', today);

    if (logsError) throw logsError;

    const completedHabitIds = new Set((logs || []).map(log => log.habit_id));
    return habits.map(habit => ({
        ...habit,
        completedToday: completedHabitIds.has(habit.id)
    }));
};

export const recomputeDailyProductivity = async (userId, dateOverride = null) => {
    try {
        const date = dateOverride || await getTodayWithOffset(userId);
        const [tasks, habits] = await Promise.all([
            fetchActiveTasks(userId),
            fetchHabitsWithTodayStatus(userId, date)
        ]);

        const { score, totals, habitsAllocated, habitsCompleted } = calculateProductivityScore(tasks, habits);

        const payload = {
            user_id: userId,
            date,
            score,
            tasks_allocated: totals.tasksAllocated,
            tasks_completed: totals.tasksCompleted,
            hours_allocated: totals.hoursAllocated,
            hours_taken: totals.hoursTaken,
            habits_allocated: habitsAllocated,
            habits_completed: habitsCompleted,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('daily_productivity')
            .upsert(payload, { onConflict: 'user_id,date' });

        if (error) throw error;
        return payload;
    } catch (err) {
        console.error('Failed to recompute daily productivity:', err);
        throw err;
    }
};

export const backfillDailyProductivity = async (userId) => {
    try {
        const today = await getTodayWithOffset(userId);

        const [{ data: activityLogs, error: activityError }, { data: habitIds, error: habitsError }] = await Promise.all([
            supabase
                .from('activity_logs')
                .select('date, type, score')
                .eq('user_id', userId)
                .order('date', { ascending: true }),
            supabase
                .from('habits')
                .select('id')
                .eq('user_id', userId)
        ]);

        if (activityError) throw activityError;
        if (habitsError) throw habitsError;

        const ownedHabitIds = (habitIds || []).map(habit => habit.id);
        let habitLogs = [];

        if (ownedHabitIds.length > 0) {
            const { data, error } = await supabase
                .from('habit_logs')
                .select('date, habit_id')
                .in('habit_id', ownedHabitIds)
                .order('date', { ascending: true });

            if (error) throw error;
            habitLogs = data || [];
        }

        const groupedByDate = new Map();

        for (const log of activityLogs || []) {
            if (!groupedByDate.has(log.date)) {
                groupedByDate.set(log.date, {
                    user_id: userId,
                    date: log.date,
                    score: 0,
                    tasks_allocated: 0,
                    tasks_completed: 0,
                    hours_allocated: 0,
                    hours_taken: 0,
                    habits_allocated: 0,
                    habits_completed: 0,
                    updated_at: new Date().toISOString()
                });
            }

            const snapshot = groupedByDate.get(log.date);
            snapshot.score += log.score || 0;
            if (log.type === 'TASK_STEP') snapshot.tasks_completed += 1;
        }

        for (const log of habitLogs) {
            if (!groupedByDate.has(log.date)) {
                groupedByDate.set(log.date, {
                    user_id: userId,
                    date: log.date,
                    score: 0,
                    tasks_allocated: 0,
                    tasks_completed: 0,
                    hours_allocated: 0,
                    hours_taken: 0,
                    habits_allocated: 0,
                    habits_completed: 0,
                    updated_at: new Date().toISOString()
                });
            }

            const snapshot = groupedByDate.get(log.date);
            snapshot.habits_completed += 1;
        }

        const historicalPayload = Array.from(groupedByDate.values())
            .filter(snapshot => snapshot.date !== today)
            .map(snapshot => ({
                ...snapshot,
                score: Number((snapshot.score || 0).toFixed(1))
            }));

        if (historicalPayload.length > 0) {
            const { error } = await supabase
                .from('daily_productivity')
                .upsert(historicalPayload, { onConflict: 'user_id,date' });

            if (error) throw error;
        }

        const todaySnapshot = await recomputeDailyProductivity(userId, today);

        return {
            historicalRows: historicalPayload.length,
            today: todaySnapshot.date
        };
    } catch (err) {
        console.error('Failed to backfill daily productivity:', err);
        throw err;
    }
};
