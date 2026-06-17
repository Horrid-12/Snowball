import express from 'express';
import axios from 'axios';
import querystring from 'querystring';
import jwt from 'jsonwebtoken';
import { supabase as serviceDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireString, validate, schemas } from '../middleware/validate.js';

const getEnv = (name) => {
    const upper = name.toUpperCase();
    for (const key of Object.keys(process.env)) {
        if (key.toUpperCase() === upper) return process.env[key];
    }
    return undefined;
};
const router = express.Router();

const getDb = () => serviceDb;

const CLIENT_ID = getEnv('SPOTIFY_CLIENT_ID');
const CLIENT_SECRET = getEnv('SPOTIFY_CLIENT_SECRET');
const REDIRECT_URI = getEnv('SPOTIFY_REDIRECT_URI');
 
// Aggressive Rate Limit Cache 🛡️📉
const nowPlayingCache = new Map(); // userId -> { data, timestamp }
const CACHE_DURATION_MS = 2000; // 2 seconds (was 15s) for snappier UI 📉⚡

const createSpotifyState = (userId) => jwt.sign(
    {
        userId,
        purpose: 'spotify_oauth'
    },
    getEnv('JWT_SECRET'),
    { expiresIn: '10m' }
);

const parseSpotifyState = (stateToken) => {
    const decoded = jwt.verify(stateToken, getEnv('JWT_SECRET'), { algorithms: ['HS256'] });

    if (decoded.purpose !== 'spotify_oauth' || !decoded.userId) {
        throw new Error('Invalid Spotify OAuth state');
    }

    return decoded.userId;
};
 
const getTokens = async (userId) => {
    const { data, error } = await serviceDb
        .from('spotify_tokens')
        .select('*')
        .eq('user_id', userId)
        .single();
    if (error) {
        console.error(`[Spotify] Error fetching tokens for user ${userId}:`, error.message);
        return null;
    }
    return data;
};

const getSpotifyCredentials = async (userId) => {
    const { data, error } = await serviceDb
        .from('spotify_credentials')
        .select('client_id, client_secret')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.warn(`[Spotify] Failed to read personal credentials for user ${userId}:`, error.message);
    }

    if (data?.client_id && data?.client_secret) {
        console.log(`[Spotify] Using personal credentials for user ${userId}`);
        return {
            clientId: data.client_id,
            clientSecret: data.client_secret,
            source: 'personal'
        };
    }

    if (CLIENT_ID && CLIENT_SECRET) {
        console.log(`[Spotify] Using shared credentials for user ${userId}`);
        return {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            source: 'shared'
        };
    }

    console.warn(`[Spotify] No credentials found for user ${userId}. CLIENT_ID: ${!!CLIENT_ID}, CLIENT_SECRET: ${!!CLIENT_SECRET}`);
    return null;
};

const updateTokens = async (userId, tokens) => {
    // If expires_in is present, calculate new expires_at. 
    // Otherwise keep existing expires_at if it's already an ISO string.
    const expires_at = tokens.expires_in
        ? new Date(Date.now() + (tokens.expires_in * 1000)).toISOString()
        : tokens.expires_at;

    const { error } = await serviceDb
        .from('spotify_tokens')
        .upsert({
            user_id: userId,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: expires_at
        });
    if (error) console.error('Failed to update Spotify tokens in DB:', error.message);
};

const refreshAccessToken = async (userId) => {
    console.log(`[Spotify] Refreshing access token for user ${userId}...`);
    const tokens = await getTokens(userId);
    if (!tokens) {
        console.warn(`[Spotify] Cannot refresh token: No tokens found in DB for user ${userId}`);
        return null;
    }
    if (!tokens.refresh_token) {
        console.warn(`[Spotify] Cannot refresh token: No refresh_token found in tokens for user ${userId}`);
        return null;
    }
    const credentials = await getSpotifyCredentials(userId);
    if (!credentials) {
        console.warn(`[Spotify] Cannot refresh token: No credentials found for user ${userId}`);
        return null;
    }

    try {
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: querystring.stringify({
                grant_type: 'refresh_token',
                refresh_token: tokens.refresh_token
            }),
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + (Buffer.from(credentials.clientId + ':' + credentials.clientSecret).toString('base64'))
            }
        });

        const newTokens = {
            ...tokens,
            ...response.data
        };
        await updateTokens(userId, newTokens);
        console.log(`✅ Spotify Token refreshed for user ${userId}`);
        return newTokens.access_token;
    } catch (err) {
        console.error(`Spotify token refresh failed for user ${userId}:`, err.response?.data || err.message);
        return null;
    }
};

router.get('/status', requireAuth, async (req, res, next) => {
    try {
        const [tokens, credentials] = await Promise.all([
            getTokens(req.user.id),
            getSpotifyCredentials(req.user.id)
        ]);

        res.json({
            connected: Boolean(tokens?.refresh_token),
            credentialSource: credentials?.source || 'missing',
            hasPersonalCredentials: credentials?.source === 'personal'
        });
    } catch (err) {
        next(err);
    }
});

router.get('/credentials', requireAuth, async (req, res, next) => {
    try {
        const { data, error } = await serviceDb
            .from('spotify_credentials')
            .select('client_id, updated_at')
            .eq('user_id', req.user.id)
            .maybeSingle();

        if (error) {
            if (error.code === '42P01') {
                return res.json({
                    clientId: '',
                    hasClientSecret: false,
                    updatedAt: null,
                    redirectUri: REDIRECT_URI || '',
                    missingTable: true
                });
            }
            throw error;
        }

        res.json({
            clientId: data?.client_id || '',
            hasClientSecret: Boolean(data?.client_id),
            updatedAt: data?.updated_at || null,
            redirectUri: REDIRECT_URI || ''
        });
    } catch (err) {
        next(err);
    }
});

router.put('/credentials', requireAuth, validate(schemas.spotifyCredentials), async (req, res, next) => {
    try {
        const { clientId, clientSecret } = req.validatedBody;

        const { data, error } = await serviceDb
            .from('spotify_credentials')
            .upsert({
                user_id: req.user.id,
                client_id: clientId,
                client_secret: clientSecret,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' })
            .select('client_id, updated_at')
            .single();

        if (error) {
            if (error.code === '42P01') {
                return res.status(400).json({
                    error: 'Run backend/spotify_credentials_migration.sql in Supabase before saving Spotify credentials.'
                });
            }
            throw error;
        }
        nowPlayingCache.delete(req.user.id);
        res.json({
            clientId: data.client_id,
            hasClientSecret: true,
            updatedAt: data.updated_at,
            redirectUri: REDIRECT_URI || ''
        });
    } catch (err) {
        next(err);
    }
});

router.delete('/credentials', requireAuth, async (req, res, next) => {
    try {
        const { error } = await serviceDb
            .from('spotify_credentials')
            .delete()
            .eq('user_id', req.user.id);

        if (error) throw error;
        nowPlayingCache.delete(req.user.id);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

router.get('/auth', requireAuth, async (req, res, next) => {
    const userId = req.user.id;
    const state = createSpotifyState(userId);
    console.log(`[Spotify] Initiating auth for user: ${userId}`);
    const credentials = await getSpotifyCredentials(userId);
    if (!credentials || !REDIRECT_URI) {
        console.error('❌ [Spotify] Missing configuration:', { credentials: !!credentials, REDIRECT_URI: !!REDIRECT_URI });
        return res.status(400).json({ error: 'Spotify not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in your environment, or add personal credentials in Settings > Spotify.' });
    }

    const scope = 'user-read-currently-playing user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative user-library-read';
    const authUrl = 'https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: credentials.clientId,
            scope: scope,
            redirect_uri: REDIRECT_URI,
            state,
            show_dialog: true // Force user to see scopes and approve again
    });
    console.log(`[Spotify] Generated signed auth state for user: ${userId}`);
    res.json({ url: authUrl });
});

router.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const stateToken = req.query.state || null;
    console.log(`[Spotify] Callback received. State: ${stateToken ? 'PRESENT' : 'MISSING'}, Code: ${code ? 'PRESENT' : 'MISSING'}`);

    if (!stateToken) {
        console.error('❌ [Spotify] No state token found in callback query');
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const frontendUrl = getEnv('FRONTEND_URL') || `${protocol}://${req.get('host')}`;
        return res.redirect(`${frontendUrl}${frontendUrl.endsWith('/') ? '' : '/'}?spotify=error_no_state`);
    }

    try {
        const userId = parseSpotifyState(stateToken);
        const credentials = await getSpotifyCredentials(userId);
        if (!credentials || !REDIRECT_URI) {
            throw new Error('Spotify configuration incomplete');
        }
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: querystring.stringify({
                code: code,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code'
            }),
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + (Buffer.from(credentials.clientId + ':' + credentials.clientSecret).toString('base64'))
            }
        });

        console.log(`[Spotify] Tokens received for user ${userId}. Saving to DB...`);
        await updateTokens(userId, response.data);
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const frontendUrl = getEnv('FRONTEND_URL') || `${protocol}://${req.get('host')}`;
        console.log(`[Spotify] Success! Redirecting to ${frontendUrl}`);
        res.redirect(`${frontendUrl}${frontendUrl.endsWith('/') ? '' : '/'}?spotify=connected`);
    } catch (error) {
        console.error('❌ [Spotify] Auth error:', error.response?.data || error.message);
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const frontendUrl = getEnv('FRONTEND_URL') || `${protocol}://${req.get('host')}`;
        res.redirect(`${frontendUrl}${frontendUrl.endsWith('/') ? '' : '/'}?spotify=error`);
    }
});

router.get('/now-playing', requireAuth, async (req, res) => {
    const userId = req.user.id;
    
    // Check Cache 🛡️📉
    const cached = nowPlayingCache.get(userId);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION_MS)) {
        // console.log(`[Spotify] Returning cached Now Playing for ${userId}`);
        return res.json(cached.data);
    }

    let tokens = await getTokens(userId);
 
    if (!tokens) {
        return res.status(401).json({ error: 'Not connected to Spotify' });
    }

    try {
        const fetchPlaying = (accessToken) => axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        let response;
        try {
            response = await fetchPlaying(tokens.access_token);
        } catch (err) {
            if (err.response?.status === 401) {
                const newAccessToken = await refreshAccessToken(userId);
                if (newAccessToken) response = await fetchPlaying(newAccessToken);
                else throw err;
            } else {
                throw err;
            }
        }

        if (response.status === 204 || !response.data) {
            const result = { is_playing: false };
            nowPlayingCache.set(userId, { data: result, timestamp: Date.now() });
            return res.json(result);
        }
 
        nowPlayingCache.set(userId, { data: response.data, timestamp: Date.now() });
        res.json(response.data);
    } catch (error) {
        const status = error.response?.status || 500;
        if (status === 429) {
            const retryAfter = error.response.headers['retry-after'] || 5;
            console.warn(`[Spotify] Rate limited on Now Playing. Retry after ${retryAfter}s`);
            return res.status(429).json({ error: 'Too many requests', retryAfter: parseInt(retryAfter), detail: `Spotify is rate limiting your account. Please wait ${retryAfter} seconds.` });
        }
        console.error('❌ [Spotify] Now Playing Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

// Wrapper to catch 401s on any specific API call
const withRefresh = async (apiCall, req, res, bustCache = false) => {
    const userId = req.user.id;
    
    if (bustCache) {
        nowPlayingCache.delete(userId); // ⚡ Clear cache immediately on control action
    }
    let tokens = await getTokens(userId);
    if (!tokens) return res.status(401).json({ error: 'Not connected' });

    try {
        await apiCall(tokens.access_token);
        res.json({ success: true });
    } catch (error) {
        const status = error.response?.status || 500;
        if (status === 429) {
            const retryAfter = error.response.headers['retry-after'] || 5;
            return res.status(429).json({ error: 'Too many requests', retryAfter: parseInt(retryAfter) });
        }
        if (status === 401) {
            const newAccessToken = await refreshAccessToken(userId);
            if (newAccessToken) {
                try {
                    await apiCall(newAccessToken);
                    return res.json({ success: true });
                } catch (err2) {
                    return res.status(err2.response?.status || 500).json(err2.response?.data || { error: err2.message });
                }
            }
        }
        res.status(status).json(error.response?.data || { error: error.message });
    }
};

// Control Routes
router.put('/pause', requireAuth, async (req, res) => {
    withRefresh((token) => axios.put('https://api.spotify.com/v1/me/player/pause', {}, {
        headers: { Authorization: `Bearer ${token}` }
    }), req, res, true);
});

router.put('/play', requireAuth, async (req, res) => {
    const { uris, context_uri } = req.body || {};
    const data = uris ? { uris } : (context_uri ? { context_uri } : {});
    withRefresh((token) => axios.put('https://api.spotify.com/v1/me/player/play', data, {
        headers: { Authorization: `Bearer ${token}` }
    }), req, res, true);
});

router.post('/next', requireAuth, async (req, res) => {
    withRefresh((token) => axios.post('https://api.spotify.com/v1/me/player/next', {}, {
        headers: { Authorization: `Bearer ${token}` }
    }), req, res, true);
});

router.post('/previous', requireAuth, async (req, res) => {
    withRefresh((token) => axios.post('https://api.spotify.com/v1/me/player/previous', {}, {
        headers: { Authorization: `Bearer ${token}` }
    }), req, res, true);
});

router.put('/volume', requireAuth, async (req, res) => {
    const volume = parseInt(req.query.volume_percent, 10);
    if (!Number.isFinite(volume) || volume < 0 || volume > 100) {
        return res.status(400).json({ error: 'volume_percent must be a number between 0 and 100' });
    }
    withRefresh((token) => axios.put('https://api.spotify.com/v1/me/player/volume', {}, {
        headers: { Authorization: `Bearer ${token}` },
        params: { volume_percent: volume }
    }), req, res);
});

router.get('/search', requireAuth, requireString('q', { source: 'query' }), async (req, res) => {
    const userId = req.user.id;
    let tokens = await getTokens(userId);
    if (!tokens) return res.status(401).json({ error: 'Not connected' });

    const q = req.query.q;

    const fetchSearch = (token) => axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`, {
        headers: { Authorization: `Bearer ${token}` }
    });

    try {
        let response;
        try { response = await fetchSearch(tokens.access_token); }
        catch (err) {
            if (err.response?.status === 401) {
                const newAccessToken = await refreshAccessToken(userId);
                if (newAccessToken) response = await fetchSearch(newAccessToken);
                else throw err;
            } else throw err;
        }

        const tracks = response.data.tracks.items.map(t => ({
            id: t.id,
            uri: t.uri,
            name: t.name,
            artist: t.artists.map(a => a.name).join(', '),
            albumArt: t.album.images[0]?.url
        }));
        res.json(tracks);
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

router.get('/playlists', requireAuth, async (req, res) => {
    const userId = req.user.id;
    let tokens = await getTokens(userId);
    if (!tokens) return res.status(401).json({ error: 'Not connected' });

    const fetchPlaylists = (token) => axios.get(`https://api.spotify.com/v1/me/playlists?limit=20`, {
        headers: { Authorization: `Bearer ${token}` }
    });

    try {
        let response;
        try { 
            response = await fetchPlaylists(tokens.access_token); 
        } catch (err) {
            console.error(`[Spotify] Fetch playlists failed for user ${userId}:`, err.response?.data || err.message);
            if (err.response?.status === 401) {
                const newAccessToken = await refreshAccessToken(userId);
                if (newAccessToken) response = await fetchPlaylists(newAccessToken);
                else throw err;
            } else throw err;
        }

        if (!response.data.items) {
            console.warn(`[Spotify] No items array in playlist response for user ${userId}:`, response.data);
            return res.json([]);
        }

        console.log(`[Spotify] Found ${response.data.items.length} playlists for user ${userId}`);
        const playlists = response.data.items
            .filter(p => p !== null) // Sometimes Spotify returns null for deleted playlists in the list
            .map(p => ({
                id: p.id,
                uri: p.uri,
                name: p.name,
                imageUrl: p.images?.[0]?.url || ''
            }));
        res.json(playlists);
    } catch (error) {
        const status = error.response?.status || 500;
        const detail = error.response?.data || error.message;
        if (status === 429) {
            const retryAfter = error.response.headers['retry-after'] || 5;
            return res.status(429).json({ error: 'Too many requests', retryAfter: parseInt(retryAfter), detail: `Spotify is rate limiting your account. Please wait ${retryAfter} seconds.` });
        }
        console.error(`❌ [Spotify] Playlists Error (${status}):`, detail);
        res.status(status).json({ 
            error: 'Failed to fetch playlists', 
            detail: typeof detail === 'string' ? detail : JSON.stringify(detail)
        });
    }
});

router.get('/lyrics', requireAuth, requireString('artist', { source: 'query' }), requireString('title', { source: 'query' }), async (req, res) => {
    const { artist, title } = req.query;
    
    try {
        // Advanced cleaning for song titles to improve lyrics match rate
        const trackTitleClean = title
            .split(' - ')[0] 
            .replace(/\(.*?\)/g, '') 
            .replace(/\[.*?\]/g, '') 
            .replace(/\b(feat|ft)\.?\b.*/gi, '') 
            .replace(/\b(remastered|remaster|deluxe|edition|anniversary|live|acoustic)\b.*/gi, '') 
            .trim();
            
        const artistClean = artist.split(',')[0].trim(); 
        
        // Primary Source: LRCLIB (Highly reliable and modern) 🎤
        try {
            const lrcRes = await axios.get(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(artistClean)}&track_name=${encodeURIComponent(trackTitleClean)}`);
            if (lrcRes.data && (lrcRes.data.plainLyrics || lrcRes.data.syncedLyrics)) {
                console.log(`[Spotify] Lyrics found via LRCLIB for: ${artistClean} - ${trackTitleClean}`);
                return res.json({ 
                    lyrics: lrcRes.data.plainLyrics || lrcRes.data.syncedLyrics,
                    syncedLyrics: lrcRes.data.syncedLyrics || null
                });
            }
        } catch (lrcErr) {
            console.warn(`[Spotify] LRCLIB failed for: ${artistClean} - ${trackTitleClean}. Trying fallbacks...`);
        }

        // Fallback 1: lyrics.ovh (Primary fallback)
        try {
            const response = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artistClean)}/${encodeURIComponent(trackTitleClean)}`);
            if (response.data.lyrics) return res.json({ lyrics: response.data.lyrics });
        } catch (err) {
            // Secondary effort with original title
            try {
                const responseOriginal = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artistClean)}/${encodeURIComponent(title)}`);
                if (responseOriginal.data.lyrics) return res.json({ lyrics: responseOriginal.data.lyrics });
            } catch (err2) {}
        }

        // Fallback 2: ChartLyrics 🎤
        try {
            const chartRes = await axios.get(`http://api.chartlyrics.com/apiv1.asmx/SearchLyricDirect?artist=${encodeURIComponent(artistClean)}&song=${encodeURIComponent(trackTitleClean)}`);
            if (chartRes.data && chartRes.data.includes('<Lyric>')) {
                const lyricMatch = chartRes.data.match(/<Lyric>(.*?)<\/Lyric>/s);
                if (lyricMatch && lyricMatch[1]) return res.json({ lyrics: lyricMatch[1].replace(/\\n/g, '\n') });
            }
        } catch (err3) {}

        res.json({ lyrics: "Lyrics not found for this track. Try searching '" + title + " lyrics' on Google." });
    } catch (err) {
        console.error("Lyrics fetch error:", err.message);
        res.json({ lyrics: `Lyrics unavailable right now. Try searching on Google or check back later.` });
    }
});

router.delete('/disconnect', requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
        const { error } = await serviceDb
            .from('spotify_tokens')
            .delete()
            .eq('user_id', userId);
        
        if (error) throw error;
        res.json({ success: true, message: 'Spotify disconnected' });
    } catch (err) {
        console.error('❌ [Spotify] Disconnect Error:', err.message);
        res.status(500).json({ error: 'Failed to disconnect Spotify' });
    }
});

export default router;
