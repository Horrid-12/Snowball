import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDB } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Register
router.post('/register', async (req, res, next) => {
    try {
        const db = getDB();
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Check unique constraints manually
        const existingUsername = await db.get('users', [['username', '==', username]]);
        if (existingUsername) return res.status(400).json({ error: 'Username already exists' });

        const existingEmail = await db.get('users', [['email', '==', email]]);
        if (existingEmail) return res.status(400).json({ error: 'Email already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const data = {
            username,
            email,
            password: hashedPassword
        };

        const result = await db.run('users', data);

        const token = jwt.sign({ id: result.lastID, username }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ token, user: { id: result.lastID, username, email } });
    } catch (err) {
        next(err);
    }
});

// Login
router.post('/login', async (req, res, next) => {
    try {
        const db = getDB();
        const { username, password } = req.body;

        const user = await db.get('users', [['username', '==', username]]);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    } catch (err) {
        next(err);
    }
});

// Me (Check Session)
router.get('/me', requireAuth, async (req, res, next) => {
    try {
        const db = getDB();
        const user = await db.get('users', [['id', '==', req.user.id]]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const { password, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
    } catch (err) {
        next(err);
    }
});

export default router;
