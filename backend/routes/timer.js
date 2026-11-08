import express from 'express';
import { supabase } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, schemas, isValidUUID } from '../middleware/validate.js';

const router = express.Router();

// Client-issued session ids are not UUIDs: a completed timer is saved locally as
// `${startedAt}_${endedAt}`, manual entries as `manual_<ts>`, etc. The primary
// key column is a uuid, so filtering on such an id made PostgREST cast the
// parameter and fail with 22P02 ("invalid input syntax for type uuid"), which
// surfaced as a 500 every time a client-created session was deleted or edited.
//
// For the `<startedAt>_<endedAt>` shape the row can still be identified exactly:
// both timestamps are the values the client posted, and (user_id, started_at)
// is unique. Anything else simply cannot match a row.
const parseClientSessionId = (id) => {
    const parts = String(id || '').split('_');
    if (parts.length !== 2) return null;
    const [startedAt, endedAt] = parts;
    // Strict ISO-8601 UTC (the shape `Date#toISOString()` produces) so a junk
    // param can never be forwarded to Postgres as a timestamp filter.
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
    if (!iso.test(startedAt) || !iso.test(endedAt)) return null;
    if (Number.isNaN(new Date(startedAt).getTime()) || Number.isNaN(new Date(endedAt).getTime())) {
        return null;
    }
    return { startedAt, endedAt };
};

const scopeSessionId = (query, id) => {
    if (isValidUUID(id)) return query.eq('id', id);
    const times = parseClientSessionId(id);
    if (!times) return null;
    return query.eq('started_at', times.startedAt).eq('ended_at', times.endedAt);
};

const isMissingColumnError = (error) => Boolean(error)
    && (error.code === '42703' || error.code === 'PGRST204');

// Resolve the id the client sent to an actual row. Clients only know the id they
// generated locally, which is now persisted as `client_id` (see
// study_sessions_idempotency_migration.sql); rows created before that column
// existed have NULL there, so fall back to the `<startedAt>_<endedAt>` timestamps
// encoded in the id.
const updateSessionScoped = async (userId, id, updates) => {
    const base = () => supabase.from('study_sessions').update(updates).eq('user_id', userId);

    if (isValidUUID(id)) {
        const { data, error } = await base().eq('id', id).select().maybeSingle();
        if (error) throw error;
        return data;
    }

    // client_id lookup (post-migration rows). Tolerate a deployment that has not
    // run the idempotency migration yet — 42703 means "column does not exist".
    const byClientId = await base().eq('client_id', id).select().maybeSingle();
    if (byClientId.error && !isMissingColumnError(byClientId.error)) throw byClientId.error;
    if (byClientId.data) return byClientId.data;

    const scoped = scopeSessionId(base(), id);
    if (!scoped) return null;

    const { data, error } = await scoped.select().maybeSingle();
    if (error) throw error;
    return data;
};

const deleteSessionScoped = async (userId, id) => {
    const base = () => supabase.from('study_sessions').delete().eq('user_id', userId);

    if (isValidUUID(id)) {
        const { error } = await base().eq('id', id);
        if (error) throw error;
        return;
    }

    // `.select()` reports which rows were actually removed so a legacy row can
    // still be found by its timestamps when client_id does not match.
    const byClientId = await base().eq('client_id', id).select('id');
    if (byClientId.error && !isMissingColumnError(byClientId.error)) throw byClientId.error;
    if (byClientId.data?.length) return;

    const scoped = scopeSessionId(base(), id);
    if (!scoped) return;

    const { error } = await scoped;
    if (error) throw error;
};

// Lightweight timer-state poll target. Other devices poll this every 15s so a
// start/stop lands everywhere quickly (a full /api/auth/me + /timer/sessions
// sync is only needed on mount/resume).
router.get('/state', requireAuth, async (req, res, next) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('study_timer_state')
            .eq('id', req.user.id)
            .single();

        if (error) {
            // Column not migrated yet or no user row: report "no state" instead of
            // failing every poll — the client then simply has nothing to adopt.
            if (error.code === '42703' || error.code === 'PGRST116') {
                return res.json({ study_timer_state: null });
            }
            throw error;
        }

        res.json({ study_timer_state: data?.study_timer_state ?? null });
    } catch (err) {
        next(err);
    }
});

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
            const lookup = supabase
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

        const data = await updateSessionScoped(req.user.id, id, updates);
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

        // Unknown client id — nothing can match, and deleting is idempotent, so
        // report success rather than an error the outbox would keep replaying.
        await deleteSessionScoped(req.user.id, id);

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

export default router;

