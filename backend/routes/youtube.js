import express from 'express';
import ytSearch from 'yt-search';
import { google } from 'googleapis';
import { requireAuth } from '../middleware/auth.js';

const getEnv = (name) => {
    const upper = name.toUpperCase();
    for (const key of Object.keys(process.env)) {
        if (key.toUpperCase() === upper) return process.env[key];
    }
    return undefined;
};
const router = express.Router();
const YOUTUBE_API_KEY = getEnv('YOUTUBE_API_KEY');

router.use(requireAuth);

const extractPlaylistId = (input = '') => {
    try {
        const value = String(input || '').trim();
        if (!value) return null;

        if (/^[A-Za-z0-9_-]{10,}$/.test(value) && !value.includes('http')) {
            return value;
        }

        const url = new URL(value);
        return url.searchParams.get('list');
    } catch (_error) {
        return null;
    }
};

// SEARCH YouTube
router.get('/search', async (req, res, next) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).json({ error: 'Query is required' });

        const results = await ytSearch(q);
        // We only need the first few videos
        const videos = results.videos.slice(0, 5).map(v => ({
            id: v.videoId,
            title: v.title,
            thumbnail: v.thumbnail,
            author: v.author.name,
            timestamp: v.timestamp
        }));

        res.json(videos);
    } catch (err) {
        next(err);
    }
});

router.get('/playlist-import', async (req, res, next) => {
    try {
        if (!YOUTUBE_API_KEY) {
            return res.status(503).json({ error: 'YouTube playlist import is not configured on the server yet.' });
        }

        const playlistInput = req.query.url || req.query.playlistId;
        const playlistId = extractPlaylistId(playlistInput);

        if (!playlistId) {
            return res.status(400).json({ error: 'A valid YouTube playlist URL or playlist ID is required.' });
        }

        const youtube = google.youtube({
            version: 'v3',
            auth: YOUTUBE_API_KEY
        });

        const playlistMetaResponse = await youtube.playlists.list({
            part: ['snippet'],
            id: [playlistId],
            maxResults: 1
        });

        const playlistMeta = playlistMetaResponse.data.items?.[0];
        if (!playlistMeta) {
            return res.status(404).json({ error: 'Playlist not found or is not publicly accessible.' });
        }

        const videos = [];
        let pageToken = undefined;

        do {
            const response = await youtube.playlistItems.list({
                part: ['snippet', 'contentDetails'],
                playlistId,
                maxResults: 50,
                pageToken
            });

            for (const item of response.data.items || []) {
                const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
                if (!videoId) continue;

                videos.push({
                    id: videoId,
                    title: item.snippet?.title || 'Untitled video',
                    thumbnail:
                        item.snippet?.thumbnails?.medium?.url ||
                        item.snippet?.thumbnails?.default?.url ||
                        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    author: item.snippet?.videoOwnerChannelTitle || item.snippet?.channelTitle || 'YouTube',
                    timestamp: ''
                });
            }

            pageToken = response.data.nextPageToken || undefined;
        } while (pageToken && videos.length < 200);

        res.json({
            id: `ytpl_${playlistId}`,
            playlistId,
            name: playlistMeta.snippet?.title || 'Imported Playlist',
            sourceUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
            videos
        });
    } catch (err) {
        next(err);
    }
});

export default router;
