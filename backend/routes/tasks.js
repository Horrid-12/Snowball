import express from 'express';
import { getDB } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from './activity.js';

const router = express.Router();

// Apply requireAuth to all task routes
router.use(requireAuth);

// GET all tasks for current user
router.get('/', async (req, res, next) => {
    try {
        const db = getDB();
        const tasks = await db.all('tasks', [['user_id', '==', req.user.id]]);
        res.json(tasks);
    } catch (err) {
        next(err);
    }
});

// GET specific task
router.get('/:id', async (req, res, next) => {
    try {
        const db = getDB();
        const task = await db.get('tasks', [['user_id', '==', req.user.id], ['id', '==', req.params.id]]);
        if (!task) {
            return res.status(404).json({ error: 'Task not found or access denied' });
        }
        res.json(task);
    } catch (err) {
        next(err);
    }
});

// CREATE a task
router.post('/', async (req, res, next) => {
    try {
        const db = getDB();
        const { title, description, date, tasksAllocated, tasksCompleted, hoursAllocated, hoursTaken, priority } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const data = {
            title,
            description: description || '',
            date: date || null,
            tasksAllocated: tasksAllocated || 0,
            tasksCompleted: tasksCompleted || 0,
            hoursAllocated: hoursAllocated || 0.0,
            hoursTaken: hoursTaken || 0.0,
            priority: priority || 'Medium',
            user_id: req.user.id
        };

        const result = await db.run('tasks', data);
        const newTask = { id: result.lastID, ...data };
        res.status(201).json(newTask);
    } catch (err) {
        next(err);
    }
});

// UPDATE a task
router.put('/:id', async (req, res, next) => {
    try {
        const db = getDB();
        const { title, description, date, tasksAllocated, tasksCompleted, hoursAllocated, hoursTaken, priority } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const data = {
            title,
            description: description || '',
            date: date || null,
            tasksAllocated: tasksAllocated || 0,
            tasksCompleted: tasksCompleted || 0,
            hoursAllocated: hoursAllocated || 0.0,
            hoursTaken: hoursTaken || 0.0,
            priority: priority || 'Medium'
        };

        const result = await db.update('tasks', req.params.id, data);

        // Log activity: we count this as a productive action
        await logActivity(req.user.id, 'TASK_STEP', req.params.id, 1.0);

        const updatedTask = { id: req.params.id, ...data, user_id: req.user.id };
        res.json(updatedTask);
    } catch (err) {
        next(err);
    }
});

// DELETE a task
router.delete('/:id', async (req, res, next) => {
    try {
        const db = getDB();
        await db.delete('tasks', req.params.id);
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

// DELETE all tasks for current user
router.delete('/', async (req, res, next) => {
    try {
        const db = getDB();
        const tasks = await db.all('tasks', [['user_id', '==', req.user.id]]);
        const batch = db.firestore.batch();
        tasks.forEach(task => {
            const ref = db.firestore.collection('tasks').doc(task.id);
            batch.delete(ref);
        });
        await batch.commit();
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

export default router;
