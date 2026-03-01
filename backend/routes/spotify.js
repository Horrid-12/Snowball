import express from 'express';
import axios from 'axios';
import querystring from 'querystring';

const router = express.Router();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

// Store tokens temporarily (in a real app, save to user record in DB)
let spotifyTokens = null;

router.get('/auth', (req, res) => {
    const scope = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';
    res.json({
        url: 'https://accounts.spotify.com/authorize?' +
            querystring.stringify({
                response_type: 'code',
                client_id: CLIENT_ID,
                scope: scope,
                redirect_uri: REDIRECT_URI
            })
    });
});

router.get('/callback', async (req, res) => {
    const code = req.query.code || null;

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
                Authorization: 'Basic ' + (new Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
            }
        });

        spotifyTokens = response.data;
        res.redirect(`${process.env.FRONTEND_URL}?spotify=connected`);
    } catch (error) {
        console.error('Spotify Auth error:', error.response?.data || error.message);
        res.redirect(`${process.env.FRONTEND_URL}?spotify=error`);
    }
});

router.get('/now-playing', async (req, res) => {
    if (!spotifyTokens) {
        return res.status(401).json({ error: 'Not connected to Spotify' });
    }

    try {
        const response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { Authorization: `Bearer ${spotifyTokens.access_token}` }
        });

        if (response.status === 204 || !response.data) {
            return res.json({ is_playing: false });
        }

        res.json(response.data);
    } catch (error) {
        // If 401, token might be expired. Handle refresh token logic here in production.
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

// Control Routes
router.put('/pause', async (req, res) => {
    if (!spotifyTokens) return res.status(401).json({ error: 'Not connected' });
    try {
        await axios.put('https://api.spotify.com/v1/me/player/pause', {}, {
            headers: { Authorization: `Bearer ${spotifyTokens.access_token}` }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

router.put('/play', async (req, res) => {
    if (!spotifyTokens) return res.status(401).json({ error: 'Not connected' });
    try {
        await axios.put('https://api.spotify.com/v1/me/player/play', {}, {
            headers: { Authorization: `Bearer ${spotifyTokens.access_token}` }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

router.post('/next', async (req, res) => {
    if (!spotifyTokens) return res.status(401).json({ error: 'Not connected' });
    try {
        await axios.post('https://api.spotify.com/v1/me/player/next', {}, {
            headers: { Authorization: `Bearer ${spotifyTokens.access_token}` }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

router.post('/previous', async (req, res) => {
    if (!spotifyTokens) return res.status(401).json({ error: 'Not connected' });
    try {
        await axios.post('https://api.spotify.com/v1/me/player/previous', {}, {
            headers: { Authorization: `Bearer ${spotifyTokens.access_token}` }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

router.put('/volume', async (req, res) => {
    if (!spotifyTokens) return res.status(401).json({ error: 'Not connected' });
    const { volume_percent } = req.query;
    try {
        await axios.put(`https://api.spotify.com/v1/me/player/volume?volume_percent=${volume_percent}`, {}, {
            headers: { Authorization: `Bearer ${spotifyTokens.access_token}` }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

router.get('/search', async (req, res) => {
    if (!spotifyTokens) return res.status(401).json({ error: 'Not connected' });
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query required' });

    try {
        const response = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`, {
            headers: { Authorization: `Bearer ${spotifyTokens.access_token}` }
        });

        // Simpify results
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

export default router;
