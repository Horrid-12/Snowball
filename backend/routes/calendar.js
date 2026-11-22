import express from 'express';
import { supabase as serviceDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { parseSince, selectNewEvents, selectUnimportedEvents, UNIMPORTED_HORIZON_MS } from '../utils/googleCalendarEvents.js';

const router = express.Router();

const getDb = (req) => req?.anonDb || serviceDb;

// Google's per-calendar poll fan-out is capped so a workspace account with
// dozens of shared calendars cannot turn one app heartbeat into a burst of API
// calls.
const MAX_WATCHED_CALENDARS = 10;

// A hub should show recent history, not just what is still in the future. The
// previous upcoming-only window made past events invisible in Snowball.
const IMPORT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const IMPORT_FORWARD_MS = 180 * 24 * 60 * 60 * 1000;
const CHANGE_BUFFER_LIMIT = 100;

const addDays = (dateStr, days) => {
    const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return dateStr;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Stored values are wall-clock local times ('YYYY-MM-DDTHH:MM'). Google uses the
// calendar's own time zone when no explicit offset is supplied.
const toGoogleDateTime = (value) => {
    const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!match) return undefined;
    return match[2] ? `${match[1]}T${match[2]}:${match[3]}:00` : match[1];
};

const toGoogleEventBody = (event) => {
    const isAllDay = !!event.is_all_day || !String(event.event_date || '').includes('T');
    const startDate = String(event.event_date || '').slice(0, 10);
    const endDate = event.end_date ? String(event.end_date).slice(0, 10) : null;
    const body = {
        summary: event.title,
        start: isAllDay ? { date: startDate } : { dateTime: toGoogleDateTime(event.event_date) },
        end: isAllDay
            // Google's all-day end date is exclusive; Snowball's is inclusive.
            ? { date: addDays(endDate && endDate > startDate ? endDate : startDate, 1) }
            : { dateTime: toGoogleDateTime(event.end_date || event.event_date) }
    };
    if (event.description) body.description = event.description;
    if (event.recurrence_rule) body.recurrence = [`RRULE:${event.recurrence_rule}`];
    return body;
};

const getEnv = (name) => {
    const upper = name.toUpperCase();
    for (const key of Object.keys(process.env)) {
        if (key.toUpperCase() === upper) return process.env[key];
    }
    return undefined;
};

// Normalize empty strings / undefined to NULL before inserting into
// nullable TIMESTAMPTZ / DATE / TEXT columns. PostgREST/Postgres rejects
// '' for timestamptz and date columns, which made event saves 500.
const cleanNullable = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    return value;
};

// Google's recurrence rules come back prefixed ("RRULE:FREQ=WEEKLY;BYDAY=MO,WE").
// Extract the matching RRULE and strip the prefix so the DB stores a clean
// "FREQ=..." value the frontend can re-expand.
const parseRrule = (rules) => {
    const found = (rules || []).find((r) => /^\s*(?:RRULE:)?FREQ=/i.test(r)) || '';
    return found.replace(/^\s*RRULE:\s*/i, '') || null;
};

const httpError = (status, message) => {
    const err = new Error(message);
    err.status = status;
    return err;
};

const isProd = () => getEnv('VERCEL') === '1' || getEnv('NODE_ENV') === 'production';

// Stable public origin for this deployment. VERCEL_URL is deployment-specific
// (snowball-<hash>-<team>.vercel.app) and changes on every deploy, so a redirect
// URI built from it can never stay registered in Google Cloud Console. Prefer an
// explicit BACKEND_URL, then the project's production domain, then VERCEL_URL.
const publicBaseUrl = () => {
    const explicit = getEnv('BACKEND_URL');
    if (explicit) return explicit.replace(/\/+$/, '');
    const prodDomain = getEnv('VERCEL_PROJECT_PRODUCTION_URL');
    if (prodDomain) return `https://${prodDomain}`;
    const deploymentUrl = getEnv('VERCEL_URL');
    if (deploymentUrl) return `https://${deploymentUrl}`;
    throw httpError(500, 'Cannot resolve the public backend URL. Set BACKEND_URL in the environment.');
};

const getOauth2Client = () => {
    const clientId = getEnv('GOOGLE_CLIENT_ID');
    const clientSecret = getEnv('GOOGLE_CLIENT_SECRET');

    // google-auth-library silently emits `client_id=&redirect_uri=` when the
    // credentials are undefined, and Google reports that as the misleading
    // "Missing required parameter: redirect_uri". Fail loudly instead.
    if (!clientId || !clientSecret) {
        console.error('Google Calendar OAuth is not configured: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing from the environment.');
        throw httpError(500, 'Google Calendar is not configured on this server.');
    }

    // The exact redirect URI must match what's in Google Cloud Console.
    const redirectUri = isProd()
        ? `${publicBaseUrl()}/api/calendar/google/callback`
        : 'http://localhost:3000/api/calendar/google/callback';

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

const getFrontendUrl = () => {
    if (!isProd()) return 'http://localhost:5173';
    const explicit = getEnv('FRONTEND_URL');
    if (explicit) return explicit.replace(/\/+$/, '');
    return publicBaseUrl();
};

// The two-way sync migration is applied manually in Supabase. Until it has been
// run, the new tables/columns do not exist and PostgREST answers PGRST204/205.
// Cache a short-lived probe so local event CRUD keeps working and the change
// feed returns an empty batch instead of spamming every calendar with errors.
let syncSchemaReady = false;
let syncSchemaCheckedAt = 0;

const canUseSyncSchema = async (db) => {
    const now = Date.now();
    if (now - syncSchemaCheckedAt < 60 * 1000) return syncSchemaReady;
    try {
        const { error } = await db.from('calendar_sync_state').select('user_id').limit(1);
        syncSchemaReady = !error || !['PGRST204', 'PGRST205'].includes(error?.code);
    } catch {
        syncSchemaReady = false;
    }
    syncSchemaCheckedAt = now;
    return syncSchemaReady;
};

const isAuthFailure = (err) => {
    const code = err?.code ?? err?.status;
    const msg = String(err?.message || '');
    return code === 401 || code === 400 && /invalid_grant|invalid_token/i.test(msg)
        || /unauthorized|invalid_grant|no token provided|invalid_token/i.test(msg);
};

// Loads the user's Google credentials and returns an authenticated calendar client.
// Shares the exact token-refresh/cleanup semantics across every Google endpoint so
// listing calendars and syncing events behave identically.
const loadGoogleClient = async (req) => {
    const db = getDb(req);
    const { data: tokenData, error: tokenError } = await db
        .from('google_calendar_tokens')
        .select('*')
        .eq('user_id', req.user.id)
        .maybeSingle();

    if (tokenError) throw tokenError;

    if (!tokenData) throw httpError(400, 'Google Calendar not connected');
    if (!tokenData.access_token) throw httpError(401, 'Google access token is missing. Please reconnect Google Calendar.');

    const oauth2Client = getOauth2Client();
    oauth2Client.setCredentials({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || undefined,
        expiry_date: tokenData.token_expiry ? new Date(tokenData.token_expiry).getTime() : undefined
    });

    const clearStoredTokens = async () => {
        await db.from('google_calendar_tokens').delete().eq('user_id', req.user.id);
    };

    // Persist any (auto-)refreshed tokens back to the DB
    oauth2Client.on('tokens', async (tokens) => {
        try {
            if (!tokens.access_token) return;
            const updates = {
                access_token: tokens.access_token,
                updated_at: new Date().toISOString()
            };
            if (tokens.refresh_token) updates.refresh_token = tokens.refresh_token;
            if (tokens.expiry_date) updates.token_expiry = new Date(tokens.expiry_date).toISOString();
            await db.from('google_calendar_tokens').update(updates).eq('user_id', req.user.id);
        } catch (err) {
            console.error('Failed to persist refreshed Google token:', err.message);
        }
    });

    // Explicitly refresh the access token when it's missing / about to expire.
    // Without this, an expired stored token makes googleapis throw the cryptic
    // "Unauthorized: No token provided." 401 instead of a useful message.
    const now = Date.now();
    if (!oauth2Client.credentials.expiry_date || oauth2Client.credentials.expiry_date <= now + 60 * 1000) {
        if (!oauth2Client.credentials.refresh_token) {
            await clearStoredTokens();
            throw httpError(401, 'Google access expired and the refresh token is missing. Please reconnect Google Calendar.');
        }
        try {
            await oauth2Client.refreshAccessToken();
        } catch (refreshErr) {
            console.error('Google token refresh failed:', refreshErr.message);
            if (isAuthFailure(refreshErr)) {
                await clearStoredTokens();
            }
            throw httpError(401, 'Google authorization expired. Please reconnect Google Calendar.');
        }
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    return { db, oauth2Client, calendar, clearStoredTokens };
};

// Push a local change to Google. Events that came from Google are updated in
// place; brand-new local events are inserted into the chosen calendar. Errors
// are reported to the caller but never roll back the local write — the app is
// the hub and must stay usable when Google is unavailable.
const pushEventToGoogle = async (client, calendarId, row, action, options = {}) => {
    const { calendar } = client;
    const googleId = row.google_event_id;
    const ignoreMissing = (err) => err?.code === 404 || err?.status === 404;

    if (action === 'delete') {
        if (!googleId) return null;
        try {
            await calendar.events.delete({ calendarId, eventId: googleId });
        } catch (err) {
            if (!ignoreMissing(err)) throw err;
        }
        return null;
    }

    if (action === 'delete-occurrence') {
        if (!googleId || !options.occurrenceStart) return null;
        try {
            await calendar.events.instances.delete({
                calendarId,
                eventId: googleId,
                eventStartTime: toGoogleDateTime(options.occurrenceStart)
            });
        } catch (err) {
            if (!ignoreMissing(err)) throw err;
        }
        return null;
    }

    const requestBody = toGoogleEventBody(row);
    if (googleId) {
        const response = await calendar.events.update({ calendarId, eventId: googleId, requestBody });
        return {
            google_etag: response.data.etag || null,
            google_updated_at: response.data.updated || null,
            calendar_id: calendarId
        };
    }

    const response = await calendar.events.insert({ calendarId, requestBody });
    return {
        google_event_id: response.data.id,
        google_etag: response.data.etag || null,
        google_updated_at: response.data.updated || null,
        calendar_id: calendarId
    };
};

const syncLocalWrite = async (req, db, row, action, options = {}) => {
    if (!await canUseSyncSchema(db)) {
        return { row, error: 'Run backend/calendar_sync_migration.sql in Supabase to enable Google write-back.' };
    }
    try {
        const client = await loadGoogleClient(req);
        const link = await pushEventToGoogle(client, options.calendarId || 'primary', row, action, options);
        if (!link) return { row, error: null };
        await db.from('calendar_events').update(link).eq('id', row.id).eq('user_id', req.user.id);
        return { row: { ...row, ...link }, error: null };
    } catch (err) {
        if (isAuthFailure(err)) {
            try { await clientClearTokens(req); } catch { /* best effort */ }
        }
        // Users who never connected Google still save locally — don't nag on
        // every event create/update with a "not connected" warning.
        if (err?.status === 400 && /not connected/i.test(err?.message || '')) {
            return { row, error: null };
        }
        console.error('Google write-back failed:', err?.message || err);
        return { row, error: err?.message || 'Google write-back failed' };
    }
};

const clientClearTokens = async (req) => {
    try {
        const client = await loadGoogleClient(req);
        await client.clearStoredTokens();
    } catch { /* nothing to clear */ }
};

// GET /google/callback - Handle OAuth callback
// Must be BEFORE requireAuth
router.get('/google/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        if (!code || !state) {
            return res.status(400).json({ error: 'Missing code or state parameter' });
        }

        // We use SUPABASE_JWT_SECRET if JWT_SECRET isn't defined explicitly
        const jwtSecret = getEnv('JWT_SECRET') || getEnv('SUPABASE_JWT_SECRET');
        if (!jwtSecret) {
            console.error("JWT secret is missing in environment");
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Verify the JWT to get user ID
        let decoded;
        try {
            decoded = jwt.verify(state, jwtSecret);
        } catch (_err) {
            return res.status(401).json({ error: 'Invalid or expired state token' });
        }
        
        const userId = decoded.sub || decoded.id;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found in token' });
        }

        const oauth2Client = getOauth2Client();
        const { tokens } = await oauth2Client.getToken(code);
        
        oauth2Client.setCredentials(tokens);
        
        // Get user info (email)
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        const email = userInfo.data.email;

        const db = getDb(req);
        
        const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null;

        // Preserve an existing refresh token. Google only returns a fresh
        // refresh_token on the FIRST authorization; on later reconnects it
        // returns just an access_token. Overwriting with null would silently
        // break every future sync (expired access + no refresh => 401s).
        let existingRefreshToken = null;
        const { data: existing } = await db
            .from('google_calendar_tokens')
            .select('refresh_token')
            .eq('user_id', userId)
            .maybeSingle();
        if (existing?.refresh_token) {
            existingRefreshToken = existing.refresh_token;
        }

        // Store tokens
        const { error } = await db
            .from('google_calendar_tokens')
            .upsert({
                user_id: userId,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token || existingRefreshToken || null,
                token_expiry: tokenExpiry,
                email: email,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            });

        if (error) {
            console.error('Error saving Google tokens:', error);
            return res.status(500).json({ error: 'Failed to save calendar configuration' });
        }

        const frontendUrl = getFrontendUrl();
        
        res.redirect(`${frontendUrl}/?gcal=connected`);
    } catch (error) {
        console.error('Google Callback Error:', error);
        const frontendUrl = getFrontendUrl();
        res.redirect(`${frontendUrl}/?gcal=error`);
    }
});

// All routes below require authentication
router.use(requireAuth);

// GET /api/calendar/events - List all calendar events for current user
// Registered at both '/' (canonical resource root) and '/events' because the
// client historically called '/api/calendar/events'. Without the alias these
// calls silently 404'd (apiFetch does not throw on 4xx), so events never saved.
const listEvents = async (req, res) => {
    try {
        const db = getDb(req);
        const { data, error } = await db
            .from('calendar_events')
            .select('*')
            .eq('user_id', req.user.id)
            .order('event_date', { ascending: true });

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Error fetching calendar events:', error);
        res.status(500).json({ error: 'Failed to fetch calendar events' });
    }
};

router.get('/', listEvents);
router.get('/events', listEvents);

// POST / - Create a calendar event
const createEvent = async (req, res) => {
    try {
        const {
            title, event_date, description, end_date, is_all_day, color, tags,
            is_dday, dday_target_date, recurrence_rule, source,
            google_event_id, calendar_id, series_id, google_etag, google_updated_at,
            calendarId
        } = req.body;

        if (!title || !event_date) {
            return res.status(400).json({ error: 'Title and event_date are required' });
        }

        const db = getDb(req);
        const payload = {
            user_id: req.user.id,
            title,
            event_date,
            description: cleanNullable(description),
            end_date: cleanNullable(end_date),
            is_all_day: is_all_day !== undefined ? !!is_all_day : true,
            color: cleanNullable(color),
            tags: cleanNullable(tags),
            is_dday: !!is_dday,
            dday_target_date: cleanNullable(dday_target_date),
            recurrence_rule: cleanNullable(recurrence_rule),
            source: source || 'manual',
            // google_event_id already existed in the original schema.
            google_event_id: cleanNullable(google_event_id)
        };
        // The remaining link columns only exist after the manual sync migration.
        // Sending them early makes PostgREST reject the whole insert with PGRST204.
        if (await canUseSyncSchema(db)) {
            payload.calendar_id = cleanNullable(calendar_id || (google_event_id ? calendarId : null));
            payload.series_id = cleanNullable(series_id);
            payload.google_etag = cleanNullable(google_etag);
            payload.google_updated_at = cleanNullable(google_updated_at);
        }

        const { data, error } = await db
            .from('calendar_events')
            .insert(payload)
            .select()
            .single();

        if (error) throw error;

        let row = data;
        let googleSyncError = null;
        // A Google import already exists on Google; only local events need a push.
        if (!google_event_id) {
            const result = await syncLocalWrite(req, db, row, 'create', { calendarId: calendarId || 'primary' });
            row = result.row;
            googleSyncError = result.error;
        }
        res.status(201).json({ ...row, googleSyncError });
    } catch (error) {
        console.error('Error creating calendar event:', error);
        res.status(500).json({ error: 'Failed to create calendar event' });
    }
};

router.post('/', createEvent);
router.post('/events', createEvent);

// PUT /:id - Update a calendar event
const updateEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const incoming = req.body || {};

        const db = getDb(req);
        
        // Ensure user owns the event
        const { data: existing, error: checkError } = await db
            .from('calendar_events')
            .select('*')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();
            
        if (checkError || !existing) {
            return res.status(404).json({ error: 'Event not found or unauthorized' });
        }

        // Whitelist editable fields and normalize empty strings to NULL so
        // the db rejects nothing (e.g. cleared end_date / dday_target_date).
        const updates = {
            title: incoming.title,
            event_date: incoming.event_date,
            description: cleanNullable(incoming.description),
            end_date: cleanNullable(incoming.end_date),
            is_all_day: incoming.is_all_day !== undefined ? !!incoming.is_all_day : undefined,
            color: cleanNullable(incoming.color),
            tags: cleanNullable(incoming.tags),
            is_dday: incoming.is_dday !== undefined ? !!incoming.is_dday : undefined,
            dday_target_date: cleanNullable(incoming.dday_target_date),
            recurrence_rule: cleanNullable(incoming.recurrence_rule)
        };

        // Drop undefined keys so untouched fields keep their current values
        Object.keys(updates).forEach((key) => {
            if (updates[key] === undefined) delete updates[key];
        });

        const { data, error } = await db
            .from('calendar_events')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('user_id', req.user.id)
            .select()
            .single();

        if (error) throw error;

        const calendarId = incoming.calendarId || existing.calendar_id || 'primary';
        const result = incoming.skipGooglePush
            ? { row: data, error: null }
            : await syncLocalWrite(req, db, { ...existing, ...updates, id: existing.id }, 'update', { calendarId });
        res.json({ ...result.row, googleSyncError: result.error });
    } catch (error) {
        console.error('Error updating calendar event:', error);
        res.status(500).json({ error: 'Failed to update calendar event' });
    }
};

router.put('/:id', updateEvent);
router.put('/events/:id', updateEvent);

// DELETE /:id - Delete a calendar event
const deleteEvent = async (req, res) => {
    try {
        const { id } = req.params;
        
        const db = getDb(req);
        const { data: existing } = await db
            .from('calendar_events')
            .select('*')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .maybeSingle();

        const { error } = await db
            .from('calendar_events')
            .delete()
            .eq('id', id)
            .eq('user_id', req.user.id);

        if (error) throw error;

        let googleSyncError = null;
        if (existing && !req.body?.skipGooglePush) {
            const result = await syncLocalWrite(req, db, existing, 'delete', {
                calendarId: existing.calendar_id || req.body?.calendarId || 'primary'
            });
            googleSyncError = result.error;
        }
        res.json({ ok: true, googleSyncError });
    } catch (error) {
        console.error('Error deleting calendar event:', error);
        res.status(500).json({ error: 'Failed to delete calendar event' });
    }
};

router.delete('/:id', deleteEvent);
router.delete('/events/:id', deleteEvent);

// POST /:id/exclude - Hide a single occurrence of a recurring event
// Appends the given date to the event's excluded_dates instead of deleting the
// whole series. The grid's isEventOnDate skips the series on that date.
const excludeEventOccurrence = async (req, res) => {
    try {
        const { id } = req.params;
        const { date } = req.body || {};

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required' });
        }

        const db = getDb(req);

        const { data: existing, error: getError } = await db
            .from('calendar_events')
            .select('*')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (getError || !existing) {
            if (getError && getError.code === 'PGRST116') {
                return res.status(404).json({ error: 'Event not found or unauthorized' });
            }
            if (getError) throw getError;
            return res.status(404).json({ error: 'Event not found or unauthorized' });
        }

        const current = Array.isArray(existing.excluded_dates) ? existing.excluded_dates : [];
        if (current.includes(date)) return res.json({ ok: true });

        const { error } = await db
            .from('calendar_events')
            .update({
                excluded_dates: [...current, date],
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('user_id', req.user.id);

        if (error) throw error;

        let googleSyncError = null;
        if (existing?.google_event_id) {
            const result = await syncLocalWrite(req, db, existing, 'delete-occurrence', {
                calendarId: existing.calendar_id || req.body?.calendarId || 'primary',
                occurrenceStart: req.body?.occurrenceStart || date
            });
            googleSyncError = result.error;
        }
        res.json({ ok: true, googleSyncError });
    } catch (error) {
        console.error('Error excluding calendar event occurrence:', error);
        res.status(500).json({ error: 'Failed to exclude this occurrence' });
    }
};

router.post('/:id/exclude', excludeEventOccurrence);
router.post('/events/:id/exclude', excludeEventOccurrence);

// GET /google/status - Check connection status
router.get('/google/status', async (req, res) => {
    try {
        const db = getDb(req);
        const { data, error } = await db
            .from('google_calendar_tokens')
            .select('email')
            .eq('user_id', req.user.id)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is not found
            throw error;
        }

        if (data) {
            res.json({ connected: true, email: data.email });
        } else {
            res.json({ connected: false });
        }
    } catch (error) {
        console.error('Error checking Google status:', error);
        res.status(500).json({ error: 'Failed to check Google connection status' });
    }
});

// GET /google/auth-url - Generate OAuth2 URL
router.get('/google/auth-url', async (req, res) => {
    try {
        const oauth2Client = getOauth2Client();
        
        // Primary auth is an HttpOnly cookie, so accept the token requireAuth
        // already resolved before falling back to a Bearer header for native apps.
        const authHeader = req.headers.authorization;
        const token = req.authToken || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Two-way sync needs event write access; existing users must reconnect once.
        const scopes = [
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/userinfo.email'
        ];

        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: scopes,
            state: token
        });

        res.json({ url });
    } catch (error) {
        if (error.status) {
            console.error('Google Calendar OAuth unavailable:', error.message);
            return res.status(error.status).json({ error: error.message });
        }
        console.error('Error generating auth URL:', error);
        res.status(500).json({ error: 'Failed to generate authorization URL' });
    }
});

// GET /google/calendars - List calendars the user can access (drives the import picker)
router.get('/google/calendars', async (req, res) => {
    try {
        const { calendar } = await loadGoogleClient(req);
        const listRes = await calendar.calendarList.list({ minAccessRole: 'reader' });
        const calendars = (listRes.data.items || []).map((c) => ({
            id: c.id,
            summary: c.summary || 'Untitled Calendar',
            is_primary: !!c.primary
        }));
        res.json(calendars);
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        console.error('Error listing Google calendars:', error);
        res.status(500).json({ error: 'Failed to list Google calendars' });
    }
});

// POST /google/check-new - Poll for events created on Google Calendar since the
// client's last check. Stateless: the client echoes back `checkedAt` from the
// previous response, so no syncToken bookkeeping is required and a lost cursor
// can never wedge the watch. Returns at most a handful of genuinely new events.
router.post('/google/check-new', async (req, res) => {
    try {
        const now = Date.now();
        const since = parseSince(req.body?.since, now);
        const { calendar, clearStoredTokens } = await loadGoogleClient(req);

        const requestedIds = Array.isArray(req.body?.calendarIds)
            ? req.body.calendarIds
                .filter((id) => typeof id === 'string' && id.trim() !== '')
                .slice(0, MAX_WATCHED_CALENDARS)
            : null;

        const calendarNames = new Map();
        let calendarIds = requestedIds;

        if (!calendarIds) {
            const listRes = await calendar.calendarList.list({ minAccessRole: 'reader' });
            const items = (listRes.data.items || [])
                .filter((item) => item && !item.deleted && item.selected !== false);
            for (const item of items) {
                calendarNames.set(item.id, item.summary || 'Calendar');
            }
            calendarIds = items.slice(0, MAX_WATCHED_CALENDARS).map((item) => item.id);
        }

        const rawEvents = [];
        for (const calendarId of calendarIds) {
            try {
                const response = await calendar.events.list({
                    calendarId,
                    updatedMin: since,
                    showDeleted: false,
                    // Matches single spend on recurring events: a new series
                    // notifies once, not once per occurrence.
                    singleEvents: true,
                    maxResults: 100,
                    fields: 'items(id,summary,location,created,status,start,end,htmlLink)',
                });
                for (const item of response.data.items || []) {
                    rawEvents.push({
                        ...item,
                        calendarId,
                        calendarName: calendarNames.get(calendarId) || null,
                    });
                }
            } catch (apiErr) {
                // An expired grant kills the whole watch, not just one calendar.
                if (isAuthFailure(apiErr)) {
                    await clearStoredTokens();
                    return res.status(401).json({ error: 'Google authorization expired. Please reconnect Google Calendar.' });
                }
                console.error(`Failed to check Google calendar ${calendarId}:`, apiErr.message);
            }
        }

        res.json({
            checkedAt: new Date(now).toISOString(),
            since,
            events: selectNewEvents(rawEvents, { since, now }),
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        console.error('Error checking for new Google events:', error);
        res.status(500).json({ error: 'Failed to check for new Google events' });
    }
});

// Loads every google_event_id already stored for the user. Paginated because
// PostgREST caps a single response at 1000 rows by default.
const loadImportedGoogleEventIds = async (req) => {
    const db = getDb(req);
    const ids = new Set();
    const PAGE_SIZE = 1000;
    const MAX_ROWS = 20000;
    for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
        const { data, error } = await db
            .from('calendar_events')
            .select('google_event_id')
            .eq('user_id', req.user.id)
            .not('google_event_id', 'is', null)
            .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        for (const row of data || []) {
            if (row?.google_event_id) ids.add(row.google_event_id);
        }
        if (!data || data.length < PAGE_SIZE) break;
    }
    return ids;
};

// POST /google/unimported - Upcoming Google events that are not in Snowball yet.
// Unlike /google/check-new this looks forward instead of at `updatedMin`, so it
// also catches events that existed before the watch baseline. The client shows a
// single summary prompt instead of one alert per event.
router.post('/google/unimported', async (req, res) => {
    try {
        const now = Date.now();
        const { calendar, clearStoredTokens } = await loadGoogleClient(req);

        const requestedIds = Array.isArray(req.body?.calendarIds)
            ? req.body.calendarIds
                .filter((id) => typeof id === 'string' && id.trim() !== '')
                .slice(0, MAX_WATCHED_CALENDARS)
            : null;

        const calendarNames = new Map();
        let calendarIds = requestedIds;

        if (!calendarIds) {
            const listRes = await calendar.calendarList.list({ minAccessRole: 'reader' });
            const items = (listRes.data.items || []).filter((item) => item && !item.deleted && item.selected !== false);
            for (const item of items) {
                calendarNames.set(item.id, item.summary || 'Calendar');
            }
            calendarIds = items.slice(0, MAX_WATCHED_CALENDARS).map((item) => item.id);
        }

        const rawEvents = [];
        for (const calendarId of calendarIds) {
            try {
                const response = await calendar.events.list({
                    calendarId,
                    timeMin: new Date(now).toISOString(),
                    timeMax: new Date(now + UNIMPORTED_HORIZON_MS).toISOString(),
                    showDeleted: false,
                    singleEvents: true,
                    orderBy: 'startTime',
                    maxResults: 250,
                    fields: 'items(id,summary,status,start,end,location,htmlLink,recurringEventId)'
                });
                for (const item of response.data.items || []) {
                    rawEvents.push({
                        ...item,
                        calendarId,
                        calendarName: calendarNames.get(calendarId) || null
                    });
                }
            } catch (apiErr) {
                // An expired grant kills the whole watch, not just one calendar.
                if (isAuthFailure(apiErr)) {
                    await clearStoredTokens();
                    return res.status(401).json({ error: 'Google authorization expired. Please reconnect Google Calendar.' });
                }
                console.error(`Failed to list upcoming Google events for ${calendarId}:`, apiErr.message);
            }
        }

        const importedIds = await loadImportedGoogleEventIds(req);
        const { events, count } = selectUnimportedEvents(rawEvents, importedIds, { now });

        res.json({ checkedAt: new Date(now).toISOString(), count, events });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        console.error('Error checking for unimported Google events:', error);
        res.status(500).json({ error: 'Failed to check for unimported Google events' });
    }
});

// POST /google/changes - Two-way change feed.
//
// The server advances a single syncToken per user+calendar, but devices poll with
// their own watermark. Every event seen in a poll is written to a rolling change
// buffer first, so a device that was asleep while another device consumed a batch
// still receives it. A 398 clears the token and triggers a full window re-sync.
router.post('/google/changes', async (req, res) => {
    try {
        const now = Date.now();
        const requestedSince = req.body?.since;
        const sinceMs = requestedSince
            ? (Date.parse(parseSince(requestedSince, now)) || now - IMPORT_LOOKBACK_MS)
            : now - IMPORT_LOOKBACK_MS;
        const since = new Date(sinceMs).toISOString();
        const { db, calendar, clearStoredTokens } = await loadGoogleClient(req);

        if (!await canUseSyncSchema(db)) {
            return res.json({
                checkedAt: new Date(now).toISOString(),
                since: new Date(now - IMPORT_LOOKBACK_MS).toISOString(),
                changes: [],
                schemaMissing: true,
                warning: 'Run backend/calendar_sync_migration.sql in Supabase to enable two-way sync.'
            });
        }

        // Only the configured calendar participates in automatic sync. Scanning
        // every subscribed/group calendar previously imported events the user
        // never asked for (holidays, shared "Gym" calendars, etc.). New events
        // from other calendars belong in the explicit Import flow instead.
        const calendarIds = [String(req.body?.calendarId || 'primary')];

        const { data: states } = await db
            .from('calendar_sync_state')
            .select('*')
            .eq('user_id', req.user.id);
        const stateByCalendar = new Map((states || []).map((state) => [state.calendar_id, state]));
        const latestByKey = new Map();

        for (const calendarId of calendarIds) {
            try {
                const state = stateByCalendar.get(calendarId);
                let eventsRaw = [];
                let nextToken = null;
                let usedFull = false;
                let tokenCleared = false;

                if (state?.sync_token) {
                    try {
                        const response = await calendar.events.list({
                            calendarId,
                            syncToken: state.sync_token,
                            maxResults: 500
                        });
                        eventsRaw = response.data.items || [];
                        nextToken = response.data.nextSyncToken || state.sync_token;
                    } catch (tokenErr) {
                        const expired = tokenErr?.code === 398
                            || (tokenErr?.status === 400 && /sync token/i.test(String(tokenErr?.message || '')));
                        if (!expired) throw tokenErr;
                        tokenCleared = true;
                        await db.from('calendar_sync_state')
                            .update({ sync_token: null, updated_at: new Date(now).toISOString() })
                            .eq('user_id', req.user.id)
                            .eq('calendar_id', calendarId);
                    }
                }

                if (!nextToken) {
                    const response = await calendar.events.list({
                        calendarId,
                        timeMin: new Date(now - IMPORT_LOOKBACK_MS).toISOString(),
                        timeMax: new Date(now + IMPORT_FORWARD_MS).toISOString(),
                        maxResults: 500,
                        singleEvents: true,
                        orderBy: 'startTime',
                        fields: 'items(id,summary,description,status,start,end,recurringEventId,recurrence,updated,etag)'
                    });
                    eventsRaw = response.data.items || [];
                    nextToken = response.data.nextSyncToken || null;
                    usedFull = true;
                }

                const rruleBySeries = new Map();
                for (const event of eventsRaw) {
                    const rule = parseRrule(event.recurrence);
                    if (rule) rruleBySeries.set(event.recurringEventId || event.id, rule);
                }
                const missingSeries = [...new Set(eventsRaw
                    .filter((event) => event.recurringEventId && !rruleBySeries.has(event.recurringEventId))
                    .map((event) => event.recurringEventId))].slice(0, 20);
                await Promise.all(missingSeries.map(async (seriesId) => {
                    try {
                        const master = await calendar.events.get({
                            calendarId, eventId: seriesId, fields: 'recurrence'
                        });
                        rruleBySeries.set(seriesId, parseRrule(master.data.recurrence));
                    } catch { rruleBySeries.set(seriesId, null); }
                }));

                for (const event of eventsRaw) {
                    if (!event?.id) continue;
                    const status = event.status === 'cancelled' ? 'cancelled' : 'existing';
                    const rule = event.recurringEventId
                        ? (rruleBySeries.get(event.recurringEventId) || null)
                        : (rruleBySeries.get(event.id) || null);
                    const untilMatch = String(rule || '').match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
                    const payload = status === 'cancelled'
                        ? { google_event_id: event.id, status: 'cancelled' }
                        : {
                            google_event_id: event.id,
                            series_id: event.recurringEventId || event.id,
                            title: event.summary || 'Untitled Event',
                            description: event.description || '',
                            event_date: event.start?.dateTime || event.start?.date || null,
                            end_date: rule
                                ? (untilMatch ? `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}` : null)
                                : (event.end?.dateTime || event.end?.date || null),
                            is_all_day: !!event.start?.date,
                            recurrence_rule: rule,
                            google_etag: event.etag || null,
                            google_updated_at: event.updated || null,
                            source: 'google',
                            calendar_id: calendarId,
                            status: 'existing'
                        };
                    latestByKey.set(`${calendarId}:${event.id}`, {
                        user_id: req.user.id,
                        calendar_id: calendarId,
                        google_event_id: event.id,
                        status,
                        payload,
                        // A first full sync must reach devices even when Google's
                        // `updated` is older than their watermark.
                        changed_at: (usedFull && (!state?.sync_token || tokenCleared)) ? new Date(now).toISOString() : (event.updated || new Date(now).toISOString())
                    });
                }

                const { error: stateError } = await db.from('calendar_sync_state').upsert({
                    user_id: req.user.id,
                    calendar_id: calendarId,
                    sync_token: nextToken,
                    last_full_sync_at: usedFull ? new Date(now).toISOString() : (state?.last_full_sync_at || null),
                    updated_at: new Date(now).toISOString()
                }, { onConflict: 'user_id,calendar_id' });
                if (stateError) throw stateError;
            } catch (apiErr) {
                if (isAuthFailure(apiErr)) {
                    await clearStoredTokens();
                    return res.status(401).json({ error: 'Google authorization expired. Please reconnect Google Calendar.' });
                }
                console.error(`Failed to sync changes for ${calendarId}:`, apiErr?.message || apiErr);
            }
        }

        const rows = [...latestByKey.values()];
        if (rows.length > 0) {
            const { error: bufferError } = await db
                .from('calendar_sync_changes')
                .upsert(rows, { onConflict: 'user_id,calendar_id,google_event_id' });
            if (bufferError) throw bufferError;
        }

        const { data: changes, error: changeError } = await db
            .from('calendar_sync_changes')
            .select('calendar_id,google_event_id,status,payload,changed_at')
            .eq('user_id', req.user.id)
            .gt('changed_at', since)
            .order('changed_at', { ascending: true })
            .limit(CHANGE_BUFFER_LIMIT);
        if (changeError) throw changeError;

        res.json({ checkedAt: new Date(now).toISOString(), since, changes: changes || [] });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        console.error('Error syncing Google changes:', error);
        res.status(500).json({ error: 'Failed to sync Google changes' });
    }
});

// POST /google/sync - Fetch events from a user's Google calendar (defaults to primary)
router.post('/google/sync', async (req, res) => {
    try {
        const { calendar, clearStoredTokens } = await loadGoogleClient(req);
        const calendarId = (req.body?.calendarId) || 'primary';
        const now = Date.now();

        let response;
        try {
            response = await calendar.events.list({
                calendarId,
                // Recent history is part of the hub, not noise. Ongoing series
                // still surface through their next future occurrence.
                timeMin: new Date(now - IMPORT_LOOKBACK_MS).toISOString(),
                timeMax: new Date(now + IMPORT_FORWARD_MS).toISOString(),
                maxResults: 500,
                singleEvents: true,
                orderBy: 'startTime',
                fields: 'items(id,summary,description,status,start,end,recurringEventId,recurrence,updated,etag)'
            });
        } catch (apiErr) {
            // A 401 here usually means the stored token is no longer valid.
            // Reset the connection so the UI flips back to "Connect" instead of
            // surfacing an opaque Google "Unauthorized: No token provided" error.
            if (isAuthFailure(apiErr)) {
                await clearStoredTokens();
                return res.status(401).json({ error: 'Google authorization expired. Please reconnect Google Calendar.' });
            }
            throw apiErr;
        }

        const rawEvents = response.data.items || [];

        // Recurring events come back expanded by singleEvents:true. Keep only the
        // FIRST instance of each series as a recurring base event so users don't
        // import 50 copies of their weekly standup. The RRULE is preserved so the
        // calendar can re-expand occurrences client-side.
        //
        // Expanded instances carry recurringEventId but NOT the recurrence rule (that
        // lives on the series master). We fetch those masters in PARALLEL batches
        // (bounded concurrency) instead of one sequential round-trip per series, which
        // is what made sync take tens of seconds on calendars with many series.
        const seen = new Set();
        const rruleBySeries = new Map();
        const seriesNeedingFetch = [];
        for (const event of rawEvents) {
            const seriesKey = event.recurringEventId || event.id;
            if (seen.has(seriesKey)) continue;
            seen.add(seriesKey);

            if (!event.recurringEventId) continue;
            const fromInstance = parseRrule(event.recurrence);
            if (fromInstance) {
                rruleBySeries.set(event.recurringEventId, fromInstance);
            } else if (!rruleBySeries.has(event.recurringEventId)) {
                seriesNeedingFetch.push(event.recurringEventId);
            }
        }

        const BATCH_SIZE = 10;
        for (let i = 0; i < seriesNeedingFetch.length; i += BATCH_SIZE) {
            await Promise.all(seriesNeedingFetch.slice(i, i + BATCH_SIZE).map(async (seriesId) => {
                try {
                    const master = await calendar.events.get({
                        calendarId,
                        eventId: seriesId,
                        fields: 'recurrence'
                    });
                    rruleBySeries.set(seriesId, parseRrule(master.data.recurrence));
                } catch {
                    rruleBySeries.set(seriesId, null);
                }
            }));
        }

        const mappedEvents = [];
        for (const event of rawEvents) {
            const seriesKey = event.recurringEventId || event.id;
            if (seen.has(seriesKey)) {
                seen.delete(seriesKey);
            } else {
                continue;
            }

            // For recurring imports, end_date MUST be the series end, not the end of
            // the single expanded instance — otherwise the grid's isEventOnDate sees
            // a terminating end_date right after the first occurrence and kills the
            // whole series. Derive it from the RRULE's UNTIL, or null if it never ends.
            const rrule = event.recurringEventId ? (rruleBySeries.get(event.recurringEventId) || null) : null;

            // Safety net for one-off events that already ended. Google's timeMin
            // normally excludes them, but an all-day/multi-day event can still come
            // back as "ongoing". Recurring series are always kept because the
            // returned instance is a future occurrence.
            if (!event.recurringEventId) {
                const endMs = Date.parse(event.end?.dateTime || event.end?.date || '');
                if (Number.isFinite(endMs) && endMs < now) continue;
            }

            let seriesEnd = null;
            if (rrule) {
                const untilMatch = String(rrule).match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
                seriesEnd = untilMatch ? `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}` : null;
            }

            mappedEvents.push({
                google_event_id: event.id,
                // Stable identity for an imported recurring series. The local row
                // stores the first instance's id, so the client compares this to
                // the id prefix to avoid offering the same series again.
                series_id: event.recurringEventId || event.id,
                title: event.summary || 'Untitled Event',
                description: event.description || '',
                event_date: event.start?.dateTime || event.start?.date,
                end_date: rrule ? seriesEnd : (event.end?.dateTime || event.end?.date),
                is_all_day: !!event.start?.date,
                recurrence_rule: rrule,
                source: 'google',
                calendar_id: calendarId,
                series_id: event.recurringEventId || event.id,
                google_etag: event.etag || null,
                google_updated_at: event.updated || null
            });
        }

        res.json(mappedEvents);
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        console.error('Error syncing Google events:', error);
        res.status(500).json({ error: 'Failed to sync Google events' });
    }
});

// POST /events/remove-google - Preview or remove Google-sourced events that came
// from one calendar. Call without `confirm` for a count, then with it to delete.
// Local-only events and events from other calendars are never touched.
router.post('/events/remove-google', async (req, res) => {
    try {
        const { calendarId, confirm } = req.body || {};
        if (!calendarId || typeof calendarId !== 'string') {
            return res.status(400).json({ error: 'calendarId is required' });
        }
        const db = getDb(req);
        const { data, error } = await db
            .from('calendar_events')
            .select('id')
            .eq('user_id', req.user.id)
            .eq('source', 'google')
            .eq('calendar_id', calendarId);
        if (error) throw error;

        const ids = (data || []).map((row) => row.id);
        if (!confirm) return res.json({ count: ids.length, calendarId });

        for (let i = 0; i < ids.length; i += 50) {
            await Promise.all(ids.slice(i, i + 50).map((id) => (
                db.from('calendar_events').delete().eq('id', id).eq('user_id', req.user.id)
            )));
        }
        res.json({ removed: ids.length, calendarId });
    } catch (error) {
        console.error('Error removing Google-sourced events:', error);
        res.status(500).json({ error: 'Failed to remove Google-sourced events' });
    }
});

// POST /events/remove-matching - Preview or remove events by title (and optional
// date range) regardless of source. Used to clean up local rows that a bad sync
// or an old bundle duplicated; always previews before deleting.
router.post('/events/remove-matching', async (req, res) => {
    try {
        const { title, from, to, confirm } = req.body || {};
        const needle = String(title || '').trim().replace(/[%_]/g, '');
        if (!needle) return res.status(400).json({ error: 'title is required' });

        const db = getDb(req);
        let query = db
            .from('calendar_events')
            .select('id,title,event_date,source')
            .eq('user_id', req.user.id)
            .ilike('title', `%${needle}%`);
        if (from) query = query.gte('event_date', from);
        if (to) query = query.lte('event_date', `${to}T23:59:59`);

        const { data, error } = await query;
        if (error) throw error;

        const rows = data || [];
        if (!confirm) {
            return res.json({
                count: rows.length,
                sample: rows.slice(0, 5).map((row) => ({
                    title: row.title,
                    date: String(row.event_date || '').slice(0, 10),
                    source: row.source
                }))
            });
        }

        const ids = rows.map((row) => row.id);
        for (let i = 0; i < ids.length; i += 50) {
            await Promise.all(ids.slice(i, i + 50).map((id) => (
                db.from('calendar_events').delete().eq('id', id).eq('user_id', req.user.id)
            )));
        }
        res.json({ removed: ids.length });
    } catch (error) {
        console.error('Error removing matching calendar events:', error);
        res.status(500).json({ error: 'Failed to remove matching events' });
    }
});

// POST /duplicates/cleanup - Merge duplicates left behind by the old importer.
// Only exact duplicates are removed automatically; anything ambiguous is reported
// for manual review so distinct events with the same title are never deleted.
router.post('/duplicates/cleanup', async (req, res) => {
    try {
        const db = getDb(req);
        const rows = [];
        for (let from = 0; from < 20000; from += 1000) {
            const { data, error } = await db
                .from('calendar_events')
                .select('id,title,event_date,end_date,is_all_day,source,google_event_id,updated_at')
                .eq('user_id', req.user.id)
                .range(from, from + 999);
            if (error) throw error;
            rows.push(...(data || []));
            if (!data || data.length < 1000) break;
        }

        const groups = new Map();
        for (const row of rows) {
            const key = [
                String(row.title || '').trim().toLowerCase(),
                String(row.event_date || '').slice(0, 16),
                row.is_all_day ? '1' : '0',
                row.source || 'manual'
            ].join('|');
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        }

        const toDelete = [];
        const ambiguous = [];
        for (const group of groups.values()) {
            if (group.length < 2) continue;
            const googleIds = new Set(group.map((row) => row.google_event_id).filter(Boolean));
            const ends = new Set(group.map((row) => String(row.end_date || '').slice(0, 10)));
            if (googleIds.size > 1 || (googleIds.size === 0 && ends.size > 1)) {
                ambiguous.push({ title: group[0].title, date: String(group[0].event_date).slice(0, 10), count: group.length });
                continue;
            }
            const sorted = [...group].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
            toDelete.push(...sorted.slice(1).map((row) => row.id));
        }

        for (let i = 0; i < toDelete.length; i += 50) {
            const batch = toDelete.slice(i, i + 50);
            await Promise.all(batch.map((id) => (
                db.from('calendar_events').delete().eq('id', id).eq('user_id', req.user.id)
            )));
        }

        res.json({ merged: toDelete.length, ambiguous: ambiguous.length, groups: ambiguous.slice(0, 20) });
    } catch (error) {
        console.error('Error cleaning duplicate calendar events:', error);
        res.status(500).json({ error: 'Failed to clean up duplicate events' });
    }
});

// DELETE /google/disconnect - Disconnect Google Calendar
router.delete('/google/disconnect', async (req, res) => {
    try {
        const db = getDb(req);
        
        // Remove tokens
        const { error: tokenError } = await db
            .from('google_calendar_tokens')
            .delete()
            .eq('user_id', req.user.id);

        if (tokenError) throw tokenError;

        // Optionally delete all google events
        const { deleteEvents } = req.body;
        if (deleteEvents) {
            await db
                .from('calendar_events')
                .delete()
                .eq('user_id', req.user.id)
                .eq('source', 'google');
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error disconnecting Google:', error);
        res.status(500).json({ error: 'Failed to disconnect Google Calendar' });
    }
});

export default router;
