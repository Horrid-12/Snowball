import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Register
router.post('/register', async (req, res, next) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const { data, error } = await supabase
            .from('users')
            .insert([{ username, email, password: hashedPassword }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') { // Unique constraint violation
                return res.status(400).json({ error: 'Username or email already exists' });
            }
            throw error;
        }

        const token = jwt.sign({ id: data.id, username: data.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, user: { id: data.id, username: data.username, email: data.email, reset_offset_hours: data.reset_offset_hours } });
    } catch (err) {
        next(err);
    }
});

// Login
router.post('/login', async (req, res, next) => {
    try {
        const { username, password } = req.body;
        console.log(`🔐 Login attempt for identifier: ${username}`);

        // Try to find user by username OR email
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .or(`username.eq.${username},email.eq.${username}`)
            .single();

        if (error || !user) {
            console.warn(`❌ Login failed: User matching "${username}" not found.`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.warn(`❌ Login failed: Password mismatch for user "${user.username}".`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log(`✅ Login successful for: ${user.username}`);
        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, username: user.username, email: user.email, reset_offset_hours: user.reset_offset_hours } });
    } catch (err) {
        console.error('🔥 Login Error:', err);
        next(err);
    }
});

// Me (Check Session)
router.get('/me', requireAuth, async (req, res, next) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, username, email, reset_offset_hours, timezone_offset_minutes')
            .eq('id', req.user.id)
            .single();

        if (error || !user) return res.status(404).json({ error: 'User not found' });

        res.json(user);
    } catch (err) {
        next(err);
    }
});

// Update User Settings (Me)
router.put('/me', requireAuth, async (req, res, next) => {
    try {
        const { reset_offset_hours, timezone_offset_minutes } = req.body;
        const updateFields = {};
        if (reset_offset_hours !== undefined) updateFields.reset_offset_hours = reset_offset_hours;
        if (timezone_offset_minutes !== undefined) updateFields.timezone_offset_minutes = timezone_offset_minutes;

        const { data: user, error } = await supabase
            .from('users')
            .update(updateFields)
            .eq('id', req.user.id)
            .select('id, username, email, reset_offset_hours, timezone_offset_minutes')
            .single();

        if (error) throw error;
        res.json(user);
    } catch (err) {
        next(err);
    }
});

// Logout
router.post('/logout', (req, res) => {
    res.json({ message: 'Logged out successfully' });
});

// Forgot Password Request
router.post('/forgot-password', async (req, res, next) => {
    try {
        const { identifier } = req.body;
        if (!identifier) {
            return res.status(400).json({ error: 'Username or Email is required' });
        }

        console.log(`🔑 Password reset requested for: ${identifier}`);

        const { error } = await supabase
            .from('support_requests')
            .insert([{
                user_identifier: identifier,
                type: 'PASSWORD_RESET',
                status: 'PENDING'
            }]);

        if (error) throw error;

        res.json({ message: 'Reset request submitted. Please contact the admin for a manual reset.' });
    } catch (err) {
        console.error('🔥 Error in /forgot-password:', err);
        next(err);
    }
});

export default router;
