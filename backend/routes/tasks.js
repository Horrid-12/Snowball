import express from 'express';
import { supabase as serviceDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

// Using service role client for all queries (app-level user filtering via .eq('user_id', ...))
// The anon client (req.anonDb) can't carry our custom JWT — Supabase PostgREST can't decode it
const getDb = () => serviceDb;
import { logActivity } from './activity.js';
import { getTodayWithOffset } from '../utils.js';
import { recomputeDailyProductivity } from '../utils/productivityScore.js';

const router = express.Router();

// Helper to map Supabase snake_case to frontend camelCase
const mapTask = (task) => {
    if (!task) return null;
    return {
        ...task,
        tasksAllocated: task.tasks_allocated,
        tasksCompleted: task.tasks_completed,
        hoursAllocated: task.hours_allocated,
        hoursTaken: task.hours_taken,
        position: task.position,
        isSticky: task.is_sticky,
        isPinned: task.is_pinned,
        recurring: task.recurring
    };
};

// Apply requireAuth to all task routes
router.use(requireAuth);

// GET all tasks for current user
router.get('/', async (req, res, next) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        console.log(`📋 Fetching tasks for user: ${req.user.id}`);
        let { data: tasks, error } = await getDb(req)
            .from('tasks')
            .select('*')
            .eq('user_id', req.user.id)
            .or('is_archived.eq.false,is_archived.is.null');

        if (error && error.code === '42703') {
            console.warn('⚠️ Missing "is_archived" column in tasks table. Loading all tasks.');
            const fallback = await getDb(req).from('tasks').select('*').eq('user_id', req.user.id);
            tasks = fallback.data;
            error = fallback.error;
        }

        if (error) {
            console.error('❌ Supabase error fetching tasks:', error.message, error.code);
            throw error;
        }

        const today = await getTodayWithOffset(req.user.id);
        const recurringUpdates = [];

        const isDifferentWeek = (dateStr1, dateStr2) => {
            const d1 = new Date(dateStr1);
            const d2 = new Date(dateStr2);
            d1.setHours(0, 0, 0, 0);
            d2.setHours(0, 0, 0, 0);
            const day1 = d1.getDay() || 7;
            d1.setDate(d1.getDate() - day1 + 1);
            const day2 = d2.getDay() || 7;
            d2.setDate(d2.getDate() - day2 + 1);
            return d1.getTime() !== d2.getTime();
        };

        // Sort in memory to avoid crashing on missing 'position' column
        const sortedTasks = (tasks || []).map(task => {
            // Check recurring reset logic
            if (task.recurring && task.recurring !== 'none' && task.date !== today) {
                const taskDateStr = (task.date || today).split(' ')[0];
                const diffDays = Math.floor((new Date(today) - new Date(taskDateStr)) / (1000 * 60 * 60 * 24));
                let shouldReset = false;

                if (task.recurring === 'daily' && diffDays >= 1) {
                    shouldReset = true;
                } else if (task.recurring === 'weekly' && isDifferentWeek(today, taskDateStr)) {
                    shouldReset = true;
                } else if (task.recurring === 'monthly') {
                    const tDate = new Date(taskDateStr);
                    const todayDate = new Date(today);
                    if (todayDate.getMonth() !== tDate.getMonth() || todayDate.getFullYear() !== tDate.getFullYear()) {
                        shouldReset = true;
                    }
                } else if (task.recurring.startsWith('custom:')) {
                    const n = parseInt(task.recurring.split(':')[1]) || 1;
                    if (diffDays >= n) shouldReset = true;
                }

                if (shouldReset) {
                    task.tasks_completed = 0;
                    task.date = today;
                    recurringUpdates.push(
                        getDb(req).from('tasks').update({ tasks_completed: 0, date: today }).eq('id', task.id)
                    );
                }
            }
            return task;
        }).sort((a, b) => {
            // 1. Pinned tasks always on top
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            
            // 2. Sort by position (if exists), then by ID (descending)
            const posA = a.position ?? 0;
            const posB = b.position ?? 0;
            if (posA !== posB) return posA - posB;
            return b.id - a.id;
        });

        // Fire-and-forget the backend recurring updates
        if (recurringUpdates.length > 0) {
            Promise.all(recurringUpdates).catch(err => console.error('Failed to update recurring tasks:', err));
        }

        res.json(sortedTasks.map(mapTask));
    } catch (err) {
        console.error('🔥 Unexpected error in GET /tasks:', err);
        next(err);
    }
});

// GET history of completed tasks
router.get('/history', async (req, res, next) => {
    try {
        let { data: tasks, error } = await getDb(req)
            .from('tasks')
            .select('*')
            .eq('user_id', req.user.id)
            .eq('is_archived', true)
            .order('id', { ascending: false })
            .limit(100);

        if (error && error.code === '42703') {
            const fallback = await getDb(req)
                .from('tasks')
                .select('*')
                .eq('user_id', req.user.id)
                .filter('tasks_completed', 'gte', 1) // Fallback behavior
                .order('id', { ascending: false })
                .limit(100);
            tasks = fallback.data;
            error = fallback.error;
        }

        if (error) throw error;
        res.json((tasks || []).map(mapTask));
    } catch (err) {
        next(err);
    }
});

// GET specific task
router.get('/:id', async (req, res, next) => {
    try {
        const { data: task, error } = await getDb(req)
            .from('tasks')
            .select('*')
            .eq('id', req.params.id)
            .eq('user_id', req.user.id)
            .single();

        if (error || !task) {
            return res.status(404).json({ error: 'Task not found or access denied' });
        }
        res.json(mapTask(task));
    } catch (err) {
        next(err);
    }
});

// CREATE a task
router.post('/', async (req, res, next) => {
    try {
        const { title, description, date, tasksAllocated, tasksCompleted, hoursAllocated, hoursTaken, priority, tags, isSticky, isPinned, recurring } = req.body;

        if (!title || typeof title !== 'string') {
            return res.status(400).json({ error: 'Title is required' });
        }
        if (title.length > 255) {
            return res.status(400).json({ error: 'Title must be at most 255 characters' });
        }
        if (description && description.length > 10000) {
            return res.status(400).json({ error: 'Description must be at most 10000 characters' });
        }
        if (tags && tags.length > 500) {
            return res.status(400).json({ error: 'Tags must be at most 500 characters' });
        }

        const taskData = {
            title,
            description: description || '',
            date: date || null,
            tasks_allocated: tasksAllocated || 0,
            tasks_completed: tasksCompleted || 0,
            hours_allocated: hoursAllocated || 0.0,
            hours_taken: hoursTaken || 0.0,
            priority: priority || 'Medium',
            tags: tags || '',
            is_sticky: isSticky || false,
            is_pinned: isPinned || false,
            recurring: recurring || 'none',
            user_id: req.user.id
        };

        // Only include position if it's explicitly provided and we think the column exists
        // (If it doesn't exist, Supabase will return an error, which we catch below)
        if (req.body.position !== undefined) {
            taskData.position = req.body.position;
        }

        let { data: newTask, error } = await getDb(req)
            .from('tasks')
            .insert([taskData])
            .select()
            .single();

        // If 'position' column is missing, retry without it
        if (error && error.code === '42703' && taskData.position !== undefined) {
            console.warn('⚠️ Retry insert without "position" column');
            delete taskData.position;
            const retry = await getDb(req).from('tasks').insert([taskData]).select().single();
            newTask = retry.data;
            error = retry.error;
        }

        if (error) throw error;
        await recomputeDailyProductivity(req.user.id);
        res.status(201).json(mapTask(newTask));
    } catch (err) {
        next(err);
    }
});

// BULK REMOVE TAG from all tasks for current user
router.put('/bulk-remove-tag', async (req, res, next) => {
    try {
        const { tag } = req.body;
        if (!tag || typeof tag !== 'string') {
            return res.status(400).json({ error: 'tag string is required' });
        }

        console.log(`🏷️ Bulk removing tag "${tag}" for user: ${req.user.id}`);

        let { data: tasks, error: fetchError } = await getDb(req)
            .from('tasks')
            .select('*')
            .eq('user_id', req.user.id)
            .or('is_archived.eq.false,is_archived.is.null');

        if (fetchError) {
            console.error('❌ Error fetching tasks for bulk tag removal:', fetchError.message);
            throw fetchError;
        }

        const cleanTag = tag.trim();
        const affected = (tasks || []).filter(t =>
            t.tags && t.tags.split(',').map(s => s.trim()).includes(cleanTag)
        );

        if (affected.length === 0) {
            return res.json({ updated: 0, tasks: [] });
        }

        const updates = affected.map(t => {
            const newTags = t.tags
                .split(',')
                .map(s => s.trim())
                .filter(s => s !== cleanTag)
                .join(', ');
            return getDb(req)
                .from('tasks')
                .update({ tags: newTags })
                .eq('id', t.id)
                .eq('user_id', req.user.id)
                .select()
                .single();
        });

        const results = await Promise.all(updates);
        const updatedTasks = results
            .filter(r => !r.error && r.data)
            .map(r => mapTask(r.data));

        console.log(`✅ Bulk removed tag "${tag}" from ${updatedTasks.length} tasks`);
        res.json({ updated: updatedTasks.length, tasks: updatedTasks });
    } catch (err) {
        console.error('🔥 Error in bulk-remove-tag:', err);
        next(err);
    }
});

// BULK RENAME TAG across all tasks for current user
router.put('/bulk-rename-tag', async (req, res, next) => {
    try {
        const { oldTag, newTag } = req.body;
        if (!oldTag || typeof oldTag !== 'string' || !newTag || typeof newTag !== 'string') {
            return res.status(400).json({ error: 'oldTag and newTag strings are required' });
        }

        console.log(`🏷️ Bulk renaming tag "${oldTag}" to "${newTag}" for user: ${req.user.id}`);

        let { data: tasks, error: fetchError } = await getDb(req)
            .from('tasks')
            .select('*')
            .eq('user_id', req.user.id)
            .or('is_archived.eq.false,is_archived.is.null');

        if (fetchError) {
            console.error('❌ Error fetching tasks for bulk tag rename:', fetchError.message);
            throw fetchError;
        }

        const cleanOld = oldTag.trim();
        const cleanNew = newTag.trim();
        const affected = (tasks || []).filter(t =>
            t.tags && t.tags.split(',').map(s => s.trim()).includes(cleanOld)
        );

        if (affected.length === 0) {
            return res.json({ updated: 0, tasks: [] });
        }

        const updates = affected.map(t => {
            const newTags = t.tags
                .split(',')
                .map(s => s.trim())
                .map(s => s === cleanOld ? cleanNew : s)
                .join(', ');
            return getDb(req)
                .from('tasks')
                .update({ tags: newTags })
                .eq('id', t.id)
                .eq('user_id', req.user.id)
                .select()
                .single();
        });

        const results = await Promise.all(updates);
        const updatedTasks = results
            .filter(r => !r.error && r.data)
            .map(r => mapTask(r.data));

        console.log(`✅ Bulk renamed tag "${oldTag}" to "${newTag}" in ${updatedTasks.length} tasks`);
        res.json({ updated: updatedTasks.length, tasks: updatedTasks });
    } catch (err) {
        console.error('🔥 Error in bulk-rename-tag:', err);
        next(err);
    }
});

// UPDATE a task
router.put('/:id', async (req, res, next) => {
    try {
        const { title, description, date, tasksAllocated, tasksCompleted, hoursAllocated, hoursTaken, priority, tags, isSticky, isPinned, recurring } = req.body;

        if (!title || typeof title !== 'string') {
            return res.status(400).json({ error: 'Title is required' });
        }
        if (title.length > 255) {
            return res.status(400).json({ error: 'Title must be at most 255 characters' });
        }
        if (description && description.length > 10000) {
            return res.status(400).json({ error: 'Description must be at most 10000 characters' });
        }
        if (tags && tags.length > 500) {
            return res.status(400).json({ error: 'Tags must be at most 500 characters' });
        }

        const updateData = {
            title,
            description: description || '',
            date: date || null,
            tasks_allocated: tasksAllocated || 0,
            tasks_completed: tasksCompleted || 0,
            hours_allocated: hoursAllocated || 0.0,
            hours_taken: hoursTaken || 0.0,
            priority: priority || 'Medium',
            tags: tags || '',
            is_sticky: isSticky !== undefined ? isSticky : false,
            is_pinned: isPinned !== undefined ? isPinned : false,
            recurring: recurring || 'none'
        };

        if (req.body.position !== undefined) {
            updateData.position = req.body.position;
        }

        let { data, error } = await getDb(req)
            .from('tasks')
            .update(updateData)
            .eq('id', req.params.id)
            .eq('user_id', req.user.id)
            .select();

        // If 'position' column is missing, retry without it
        if (error && error.code === '42703' && updateData.position !== undefined) {
            console.warn('⚠️ Retry update without "position" column');
            delete updateData.position;
            const retry = await getDb(req)
                .from('tasks')
                .update(updateData)
                .eq('id', req.params.id)
                .eq('user_id', req.user.id)
                .select();
            data = retry.data;
            error = retry.error;
        }

        if (error || !data || data.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Log activity
        await logActivity(req.user.id, 'TASK_STEP', req.params.id, 1.0);
        await recomputeDailyProductivity(req.user.id);

        res.json(mapTask(data[0]));
    } catch (err) {
        next(err);
    }
});

// DELETE all tasks for current user
router.delete('/', async (req, res, next) => {
    try {
        let { error } = await getDb(req)
            .from('tasks')
            .update({ is_archived: true })
            .eq('user_id', req.user.id)
            .eq('is_sticky', false)
            .or('recurring.is.null,recurring.eq.none');

        if (error && error.code === '42703') {
            console.warn('⚠️ Missing "is_archived" column. Falling back to hard DELETE.');
            const fallback = await getDb(req)
                .from('tasks')
                .delete()
                .eq('user_id', req.user.id)
                .eq('is_sticky', false)
                .or('recurring.is.null,recurring.eq.none');
            error = fallback.error;
        }

        if (error) throw error;
        await recomputeDailyProductivity(req.user.id);
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

// DELETE a specific task
router.delete('/:id', async (req, res, next) => {
    try {
        let { error, data } = await getDb(req)
            .from('tasks')
            .update({ is_archived: true })
            .eq('id', req.params.id)
            .eq('user_id', req.user.id)
            .select();

        let count = data ? data.length : 0;

        if (error && error.code === '42703') {
            console.warn('⚠️ Missing "is_archived" column. Falling back to hard DELETE.');
            const fallback = await getDb(req)
                .from('tasks')
                .delete({ count: 'exactly' })
                .eq('id', req.params.id)
                .eq('user_id', req.user.id);
            error = fallback.error;
            count = fallback.count;
        }

        if (error || count === 0) {
            return res.status(404).json({ error: 'Task not found or access denied' });
        }
        await recomputeDailyProductivity(req.user.id);
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

// BULK REORDER tasks
router.put('/reorder/all', async (req, res, next) => {
    try {
        const { tasks } = req.body; // Array of { id, position }
        if (!tasks || !Array.isArray(tasks)) {
            return res.status(400).json({ error: 'Tasks array is required' });
        }

        console.log(`🔃 Bulk reordering ${tasks.length} tasks for user: ${req.user.id}`);

        // Update each task's position
        // Note: For large lists, a more optimized approach might be needed
        const updates = tasks.map(t =>
            getDb(req)
                .from('tasks')
                .update({ position: t.position })
                .eq('id', t.id)
                .eq('user_id', req.user.id)
        );

        await Promise.all(updates);
        res.json({ message: 'Tasks reordered successfully' });
    } catch (err) {
        console.error('🔥 Error in bulk reorder:', err);
        next(err);
    }
});
export default router;
