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
        const { subject, started_at, ended_at, duration_ms, client_id } = req.validatedBody;

        const row = {
            user_id: req.user.id,
            subject,
            started_at,
            ended_at,
            duration_ms
        };
        if (client_id) row.client_id = client_id;

        let { data, error } = await supabase
            .from('study_sessions')
            .insert([row])
            .select()
            .single();

        // The client_id column only exists after study_sessions_idempotency_migration.sql
        // runs. Until then the insert fails with a missing-column error — retry without
        // client_id so session creates keep working (idempotency degrades gracefully).
        if (error && (error.code === 'PGRST204' || error.code === '42703' || /client_id/i.test(error.message || ''))) {
            delete row.client_id;
            ({ data, error } = await supabase
                .from('study_sessions')
                .insert([row])
                .select()
                .single());
        }

        if (error && error.code === '23505') {
            // Unique violation — this session already exists. Treat as success so
            // outbox replays / lost-response retries don't surface as failures.
            let lookup = supabase
                .from('study_sessions')
                .select('*')
                .eq('user_id', req.user.id)
                .eq('started_at', started_at)
                .limit(1)
                .maybeSingle();
            let { data: existing, error: lookupError } = await lookup;
            if ((!existing || lookupError) && client_id) {
                ({ data: existing, error: lookupError } = await supabase
                    .from('study_sessions')
                    .select('*')
                    .eq('user_id', req.user.id)
                    .eq('client_id', client_id)
                    .limit(1)
                    .maybeSingle());
            }
            if (lookupError || !existing) throw error;
            return res.status(200).json({
                id: existing.id,
                subject: existing.subject,
                startedAt: existing.started_at,
                endedAt: existing.ended_at,
                durationMs: existing.duration_ms
            });
        }

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

// Update a single study session
router.put('/sessions/:id', requireAuth, validate(schemas.studySessionUpdate), async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.validatedBody;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const { data, error } = await supabase
            .from('study_sessions')
            .update(updates)
            .eq('id', id)
            .eq('user_id', req.user.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Session not found' });

        res.json({
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

// Delete a single study session by ID
router.delete('/sessions/:id', requireAuth, async (req, res, next) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('study_sessions')
            .delete()
            .eq('id', id)
            .eq('user_id', req.user.id);

        if (error) throw error;

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

export default router;

