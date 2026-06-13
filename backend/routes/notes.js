import express from 'express';
import { supabase as serviceDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';

const getDb = () => serviceDb;

const router = express.Router();

router.use(requireAuth);

// GET all user notes
router.get('/', async (req, res, next) => {
    try {
        const { data, error } = await getDb(req)
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
router.put('/', validate(schemas.noteUpsert), async (req, res, next) => {
    try {
        const { note_id, title, content } = req.validatedBody;

        const { data, error } = await getDb(req)
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
        const { error } = await getDb(req)
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
