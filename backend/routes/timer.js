import express from 'express';
import { supabase } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';

const router = express.Router();

// Get recent study sessions
router.get('/sessions', requireAuth, async (req, res, next) => {
    try {
        const { data, error } = await supabase
            .from('study_sessions')
            .select('*')
            .eq('user_id', req.user.id)
            .order('started_at', { ascending: false })
            .limit(500);

        if (error) throw error;

        // Map to match frontend expectations
        const sessions = data.map(session => ({
            id: session.id,
            subject: session.subject,
            startedAt: session.started_at,
            endedAt: session.ended_at,
            durationMs: session.duration_ms
        })).reverse(); // Reverse to return chronologically ascending for DeepWorkTimer.jsx

        res.json(sessions);
    } catch (err) {
        next(err);
    }
});

// Create a new study session
router.post('/sessions', requireAuth, validate(schemas.studySession), async (req, res, next) => {
    try {
        const { subject, started_at, ended_at, duration_ms } = req.validatedBody;

        const { data, error } = await supabase
            .from('study_sessions')
            .insert([{
                user_id: req.user.id,
                subject,
                started_at,
                ended_at,
                duration_ms
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            id: data.id,
            subject: data.subject,
            startedAt: data.started_at,
            endedAt: data.ended_at,
            durationMs: data.duration_ms
        });
    } catch (err) {
        next(err);
    }
});

// Delete study sessions within a date range (used by "Reset Today")
router.delete('/sessions', requireAuth, async (req, res, next) => {
    try {
        const { from, to } = req.query;

        if (!from || !to) {
            return res.status(400).json({ error: 'Both "from" and "to" query parameters are required (ISO 8601)' });
        }

        const { error } = await supabase
            .from('study_sessions')
            .delete()
            .eq('user_id', req.user.id)
            .gte('started_at', from)
            .lte('started_at', to);

        if (error) throw error;

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

export default router;
