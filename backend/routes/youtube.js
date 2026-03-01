import express from 'express';
import ytSearch from 'yt-search';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

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

export default router;
