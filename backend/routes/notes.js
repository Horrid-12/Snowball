import express from 'express';
import { supabase } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// GET user note
router.get('/', async (req, res, next) => {
    try {
        const { data, error } = await supabase
            .from('notes')
            .select('content')
            .eq('user_id', req.user.id)
            .maybeSingle();

        if (error) throw error;
        res.json(data || { content: '' });
    } catch (err) {
        next(err);
    }
});

// UPDATE user note
router.put('/', async (req, res, next) => {
    try {
        const { content } = req.body;
        const { data, error } = await supabase
            .from('notes')
            .upsert({
                user_id: req.user.id,
                content: content || '',
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        next(err);
    }
});

export default router;
