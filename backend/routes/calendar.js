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
        const { title, event_date, description, end_date, is_all_day, color, tags, is_dday, dday_target_date, recurrence_rule, source } = req.body;
        
        if (!title || !event_date) {
            return res.status(400).json({ error: 'Title and event_date are required' });
        }

        const db = getDb(req);
        const { data, error } = await db
            .from('calendar_events')
            .insert({
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
                source: source || 'manual'
            })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
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
            .select('id')
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
        res.json(data);
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
        const { error } = await db
            .from('calendar_events')
            .delete()
            .eq('id', id)
            .eq('user_id', req.user.id);

        if (error) throw error;
        res.status(204).send();
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
            .select('excluded_dates')
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
        res.json({ ok: true });
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
        
        // Use the auth token from req headers as state
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing authorization header' });
        }
        const token = authHeader.split(' ')[1];

        const scopes = ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/userinfo.email'];

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
                // Import only upcoming events: a month of history is noise. Past
                // one-offs are excluded, but recurring series still appear through
                // their next future occurrence (singleEvents expands them), so an
                // ongoing weekly meeting is never lost.
                timeMin: new Date(now).toISOString(),
                timeMax: new Date(now + 180 * 24 * 60 * 60 * 1000).toISOString(),
                maxResults: 500,
                singleEvents: true,
                orderBy: 'startTime',
                fields: 'items(id,summary,description,start,end,recurringEventId,recurrence)'
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
                source: 'google'
            });
        }

        res.json(mappedEvents);
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        console.error('Error syncing Google events:', error);
        res.status(500).json({ error: 'Failed to sync Google events' });
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
