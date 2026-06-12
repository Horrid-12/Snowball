import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { supabase } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { revokeToken } from '../middleware/sessionStore.js';
import { validate, schemas } from '../middleware/validate.js';

const getEnv = (name) => {
    const upper = name.toUpperCase();
    for (const key of Object.keys(process.env)) {
        if (key.toUpperCase() === upper) return process.env[key];
    }
    return undefined;
};
const router = express.Router();
const MIN_PASSWORD_LENGTH = 8;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const authRateLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    message: 'Too many authentication attempts. Please try again later.'
});

const getCookieOptions = () => {
    const isProduction = process.env.NODE_ENV === 'production';

    return [
        'HttpOnly',
        'Path=/',
        `Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}`,
        isProduction ? 'Secure' : null,
        `SameSite=${isProduction ? 'None' : 'Lax'}`
    ].filter(Boolean).join('; ');
};

const setAuthCookie = (res, token) => {
    res.setHeader('Set-Cookie', `snowball_token=${encodeURIComponent(token)}; ${getCookieOptions()}`);
};

const clearAuthCookie = (res) => {
    const isProduction = process.env.NODE_ENV === 'production';
    res.setHeader(
        'Set-Cookie',
        `snowball_token=; HttpOnly; Path=/; Max-Age=0; ${isProduction ? 'Secure; SameSite=None' : 'SameSite=Lax'}`
    );
};

const issueAuthToken = (user) => jwt.sign(
    { id: user.id, username: user.username },
    getEnv('JWT_SECRET'),
    {
        expiresIn: '7d',
        jwtid: randomUUID()
    }
);

const buildMissingUserRecord = async (req, extraFields = {}) => ({
    id: req.user.id,
    username: req.user.username || 'guest',
    email: req.user.email || `${req.user.id}@snowball.local`,
    password: await bcrypt.hash(randomUUID(), 10),
    ...extraFields
});

const USER_BASE_FIELDS = ['id', 'username', 'email', 'reset_offset_hours'];
const USER_OPTIONAL_FIELDS = ['timezone_offset_minutes', 'penalty_buffer_hours', 'appearance_settings', 'profile_icon', 'tag_colors', 'study_timer_state'];

const getUserSelectClause = (optionalFields = USER_OPTIONAL_FIELDS) => [
    ...USER_BASE_FIELDS,
    ...optionalFields
].join(', ');

const getMissingColumnFromError = (error) => {
    const message = error?.message || '';
    const match = message.match(/Could not find the '([^']+)' column/i);
    return match ? match[1] : null;
};

const selectUserWithFallback = async (userId, optionalFields = USER_OPTIONAL_FIELDS) => {
    let remainingFields = [...optionalFields];

    while (true) {
        const result = await supabase
            .from('users')
            .select(getUserSelectClause(remainingFields))
            .eq('id', userId)
            .single();

        if (!result.error || result.error.code !== '42703') {
            return result;
        }

        const missingColumn = getMissingColumnFromError(result.error);
        if (!missingColumn || !remainingFields.includes(missingColumn)) {
            return result;
        }

        remainingFields = remainingFields.filter(field => field !== missingColumn);
    }
};

const updateUserWithFallback = async (userId, updateFields, optionalFields = USER_OPTIONAL_FIELDS) => {
    let remainingFields = [...optionalFields];
    const mutableFields = { ...updateFields };

    while (true) {
        const result = await supabase
            .from('users')
            .update(mutableFields)
            .eq('id', userId)
            .select(getUserSelectClause(remainingFields))
            .single();

        if (!result.error || result.error.code !== '42703') {
            return result;
        }

        const missingColumn = getMissingColumnFromError(result.error);
        if (!missingColumn) {
            return result;
        }

        delete mutableFields[missingColumn];
        remainingFields = remainingFields.filter(field => field !== missingColumn);
    }
};

const mapUserSettings = (user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    reset_offset_hours: user.reset_offset_hours,
    timezone_offset_minutes: user.timezone_offset_minutes,
    penalty_buffer_hours: user.penalty_buffer_hours ?? 3,
    appearance_settings: user.appearance_settings ?? null,
    profile_icon: user.profile_icon || 'snowball',
    tag_colors: user.tag_colors ?? {},
    study_timer_state: user.study_timer_state ?? null
});

// Register
router.post('/register', authRateLimit, validate(schemas.register), async (req, res, next) => {
    try {
        const { username, email, password } = req.validatedBody;

        const hashedPassword = await bcrypt.hash(password, 10);

        const { data, error } = await supabase
            .from('users')
            .insert([{
                username: username.trim(),
                email: email.trim().toLowerCase(),
                password: hashedPassword
            }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') { // Unique constraint violation
                return res.status(400).json({ error: 'Username or email already exists' });
            }
            throw error;
        }

        const token = issueAuthToken(data);
        setAuthCookie(res, token);
        res.status(201).json({ token, user: mapUserSettings(data) });
    } catch (err) {
        next(err);
    }
});

// Login
router.post('/login', authRateLimit, validate(schemas.login), async (req, res, next) => {
    try {
        const { username, password } = req.validatedBody;
        const identifier = username.trim();

        // Use separate `.eq()` calls instead of `.or()` string interpolation
        // to prevent PostgREST filter injection (`,`, `)`, `.eq` in username)
        let user, error;

        const asEmail = identifier.toLowerCase();
        const asUsername = identifier;

        if (asEmail.includes('@')) {
            const result = await supabase
                .from('users')
                .select('*')
                .eq('email', asEmail)
                .single();
            user = result.data;
            error = result.error;
        } else {
            const result = await supabase
                .from('users')
                .select('*')
                .eq('username', asUsername)
                .single();
            user = result.data;
            error = result.error;
        }

        // Fallback: try the other field if first failed
        if (!user) {
            const secondField = asEmail.includes('@') ? 'username' : 'email';
            const secondValue = secondField === 'email' ? asEmail : asUsername;
            const result = await supabase
                .from('users')
                .select('*')
                .eq(secondField, secondValue)
                .single();
            user = result.data;
            error = result.error;
        }

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = issueAuthToken(user);
        setAuthCookie(res, token);
        res.json({ token, user: mapUserSettings(user) });
    } catch (err) {
        next(err);
    }
});

// Me (Check Session)
router.get('/me', requireAuth, async (req, res, next) => {
    try {
        const { data: user, error } = await selectUserWithFallback(req.user.id);

        if (error || !user) {
            // Auto-create user record if missing (e.g. database reset /
            // guest account not yet synced to Supabase)
            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert(await buildMissingUserRecord(req))
                .select(getUserSelectClause())
                .single();
            if (insertError) {
                return res.status(404).json({ error: 'User not found' });
            }
            return res.json(mapUserSettings(newUser));
        }

        res.json(mapUserSettings(user));
    } catch (err) {
        next(err);
    }
});

// Update User Settings (Me)
router.put('/me', requireAuth, validate(schemas.userSettings), async (req, res, next) => {
    try {
        const { reset_offset_hours, timezone_offset_minutes, penalty_buffer_hours, appearance_settings, profile_icon, tag_colors, study_timer_state } = req.validatedBody;
        const updateFields = {};
        if (reset_offset_hours !== undefined) updateFields.reset_offset_hours = reset_offset_hours;
        if (timezone_offset_minutes !== undefined) updateFields.timezone_offset_minutes = timezone_offset_minutes;
        if (penalty_buffer_hours !== undefined) updateFields.penalty_buffer_hours = penalty_buffer_hours;
        if (appearance_settings !== undefined) updateFields.appearance_settings = appearance_settings;
        if (profile_icon !== undefined) updateFields.profile_icon = String(profile_icon || 'snowball').trim().slice(0, 40);
        if (tag_colors !== undefined) updateFields.tag_colors = tag_colors;
        if (study_timer_state !== undefined) updateFields.study_timer_state = study_timer_state;

        if (Object.keys(updateFields).length === 0) {
            const { data: user, error } = await selectUserWithFallback(req.user.id);

            if (error || !user) return res.status(404).json({ error: 'User not found' });
            return res.json(mapUserSettings(user));
        }

        const { data: user, error } = await updateUserWithFallback(req.user.id, updateFields);

        if (error) throw error;

        if (!user) {
            // User didn't exist in Supabase — create with the data we have
            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert(await buildMissingUserRecord(req, updateFields))
                .select(getUserSelectClause())
                .single();
            if (insertError) throw insertError;
            return res.json(mapUserSettings(newUser));
        }

        res.json(mapUserSettings(user));
    } catch (err) {
        next(err);
    }
});

// Logout
router.post('/logout', requireAuth, (req, res) => {
    revokeToken(req.user.jti, req.user.exp);
    clearAuthCookie(res);
    res.json({ message: 'Logged out successfully' });
});

// Forgot Password Request
router.post('/forgot-password', authRateLimit, validate(schemas.forgotPassword), async (req, res, next) => {
    try {
        const { identifier } = req.validatedBody;

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
        next(err);
    }
});

export default router;
