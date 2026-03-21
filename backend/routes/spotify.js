import express from 'express';
import axios from 'axios';
import querystring from 'querystring';
import { supabase } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
 
// Aggressive Rate Limit Cache 🛡️📉
const nowPlayingCache = new Map(); // userId -> { data, timestamp }
const CACHE_DURATION_MS = 2000; // 2 seconds (was 15s) for snappier UI 📉⚡
 
const getTokens = async (userId) => {
    const { data, error } = await supabase
        .from('spotify_tokens')
        .select('*')
        .eq('user_id', userId)
        .single();
    if (error) return null;
    return data;
};

const updateTokens = async (userId, tokens) => {
    // If expires_in is present, calculate new expires_at. 
    // Otherwise keep existing expires_at if it's already an ISO string.
    const expires_at = tokens.expires_in
        ? new Date(Date.now() + (tokens.expires_in * 1000)).toISOString()
        : tokens.expires_at;

    const { error } = await supabase
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
    const tokens = await getTokens(userId);
    if (!tokens || !tokens.refresh_token) return null;

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
                Authorization: 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
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

router.get('/auth', requireAuth, (req, res) => {
    const userId = req.user.id;
    console.log(`[Spotify] Initiating auth for user: ${userId}`);
    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
        console.error('❌ [Spotify] Missing Environment Variables:', { CLIENT_ID: !!CLIENT_ID, CLIENT_SECRET: !!CLIENT_SECRET, REDIRECT_URI: !!REDIRECT_URI });
        return res.status(500).json({ error: 'Spotify configuration incomplete' });
    }

    const scope = 'user-read-currently-playing user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative user-library-read';
    const authUrl = 'https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: CLIENT_ID,
            scope: scope,
            redirect_uri: REDIRECT_URI,
            state: userId,
            show_dialog: true // Force user to see scopes and approve again
        });
    console.log(`[Spotify] Generated Auth URL with state: ${userId}`);
    res.json({ url: authUrl });
});

router.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const userId = req.query.state || null;
    console.log(`[Spotify] Callback received. State(userId): ${userId}, Code: ${code ? 'PRESENT' : 'MISSING'}`);

    if (!userId) {
        console.error('❌ [Spotify] No state (userId) found in callback query');
        return res.redirect((process.env.FRONTEND_URL || '/') + '?spotify=error_no_state');
    }

    try {
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
                Authorization: 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
            }
        });

        console.log(`[Spotify] Tokens received for user ${userId}. Saving to DB...`);
        await updateTokens(userId, response.data);
        const frontendUrl = process.env.FRONTEND_URL || '/';
        console.log(`[Spotify] Success! Redirecting to ${frontendUrl}`);
        res.redirect(`${frontendUrl}${frontendUrl.endsWith('/') ? '' : '/'}?spotify=connected`);
    } catch (error) {
        console.error('❌ [Spotify] Auth error:', error.response?.data || error.message);
        const frontendUrl = process.env.FRONTEND_URL || '/';
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
    const { volume_percent } = req.query;
    withRefresh((token) => axios.put(`https://api.spotify.com/v1/me/player/volume?volume_percent=${volume_percent}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
    }), req, res);
});

router.get('/search', requireAuth, async (req, res) => {
    const userId = req.user.id;
    let tokens = await getTokens(userId);
    if (!tokens) return res.status(401).json({ error: 'Not connected' });

    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query required' });

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

router.get('/lyrics', requireAuth, async (req, res) => {
    const { artist, title } = req.query;
    if (!artist || !title) return res.status(400).json({ error: 'Artist and title required' });
    
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
        const { error } = await supabase
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
