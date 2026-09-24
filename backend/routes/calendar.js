import express from 'express';
import { supabase as serviceDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { google } from 'googleapis';
import jwt from 'jsonwebtoken';

const router = express.Router();

const getDb = (req) => req?.anonDb || serviceDb;

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

const getOauth2Client = () => {
    const clientId = getEnv('GOOGLE_CLIENT_ID');
    const clientSecret = getEnv('GOOGLE_CLIENT_SECRET');
    
    // Redirect URI
    const isProd = getEnv('VERCEL') === '1' || getEnv('NODE_ENV') === 'production';
    // The exact redirect URI must match what's in Google Cloud Console
    let redirectUri = 'http://localhost:3000/api/calendar/google/callback';
    if (isProd) {
        const backendUrl = getEnv('BACKEND_URL') || `https://${getEnv('VERCEL_URL')}`;
        redirectUri = `${backendUrl}/api/calendar/google/callback`;
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

const httpError = (status, message) => {
    const err = new Error(message);
    err.status = status;
    return err;
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
        } catch (err) {
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

        const isProd = getEnv('VERCEL') === '1' || getEnv('NODE_ENV') === 'production';
        const frontendUrl = isProd ? (getEnv('FRONTEND_URL') || `https://${getEnv('VERCEL_URL')}`) : 'http://localhost:5173';
        
        res.redirect(`${frontendUrl}/?gcal=connected`);
    } catch (error) {
        console.error('Google Callback Error:', error);
        const isProd = getEnv('VERCEL') === '1' || getEnv('NODE_ENV') === 'production';
        const frontendUrl = isProd ? (getEnv('FRONTEND_URL') || `https://${getEnv('VERCEL_URL')}`) : 'http://localhost:5173';
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
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
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

// POST /google/sync - Fetch events from a user's Google calendar (defaults to primary)
router.post('/google/sync', async (req, res) => {
    try {
        const { calendar, clearStoredTokens } = await loadGoogleClient(req);
        const calendarId = (req.body && req.body.calendarId) || 'primary';

        let response;
        try {
            response = await calendar.events.list({
                calendarId,
                timeMin: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                maxResults: 250,
                singleEvents: true,
                orderBy: 'startTime'
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
        const seen = new Set();
        const mappedEvents = [];
        for (const event of rawEvents) {
            const seriesKey = event.recurringEventId || event.id;
            if (seen.has(seriesKey)) continue;
            seen.add(seriesKey);

            const rrule = (event.recurrence || []).find((r) => /^\s*FREQ=/i.test(r)) || null;

            mappedEvents.push({
                google_event_id: event.id,
                title: event.summary || 'Untitled Event',
                description: event.description || '',
                event_date: event.start?.dateTime || event.start?.date,
                end_date: event.end?.dateTime || event.end?.date,
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
