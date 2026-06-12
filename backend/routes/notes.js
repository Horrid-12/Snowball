import express from 'express';
import { supabase } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// GET all user notes
router.get('/', async (req, res, next) => {
    try {
        const { data, error } = await supabase
            .from('notes')
            .select('note_id, title, content, updated_at')
            .eq('user_id', req.user.id)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        next(err);
    }
});

// UPDATE/INSERT a specific note
router.put('/', async (req, res, next) => {
    try {
        const { note_id, title, content } = req.body;
        if (!note_id) return res.status(400).json({ error: 'note_id is required' });
        if (note_id.length > 100) return res.status(400).json({ error: 'note_id too long' });
        if (title && title.length > 500) return res.status(400).json({ error: 'Title too long' });
        if (content && content.length > 100000) return res.status(400).json({ error: 'Content too long' });

        const { data, error } = await supabase
            .from('notes')
            .upsert({
                user_id: req.user.id,
                note_id: note_id,
                title: title || 'Untitled',
                content: content || '',
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id, note_id' })
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        next(err);
    }
});

// DELETE a specific note
router.delete('/:note_id', async (req, res, next) => {
    try {
        const { note_id } = req.params;
        const { error } = await supabase
            .from('notes')
            .delete()
            .eq('user_id', req.user.id)
            .eq('note_id', note_id);

        if (error) throw error;
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

export default router;
