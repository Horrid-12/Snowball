import jwt from 'jsonwebtoken';
import { isTokenRevoked } from './sessionStore.js';
import { getAnonClient } from '../db.js';

const getEnv = (name) => {
    const upper = name.toUpperCase();
    for (const key of Object.keys(process.env)) {
        if (key.toUpperCase() === upper) return process.env[key];
    }
    return undefined;
};

const getJwtSecret = () => {
    const secret = getEnv('JWT_SECRET');
    if (!secret) {
        throw new Error('JWT_SECRET environment variable is required.');
    }

    return secret;
};

const parseCookies = (cookieHeader = '') => cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex === -1) return acc;

        const key = part.slice(0, separatorIndex);
        const value = decodeURIComponent(part.slice(separatorIndex + 1));
        acc[key] = value;
        return acc;
    }, {});

export const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const cookies = parseCookies(req.headers.cookie);
    const bearerToken = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : null;
    const token = bearerToken || cookies.snowball_token;

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
        if (isTokenRevoked(decoded.jti)) {
            return res.status(401).json({ error: 'Unauthorized: Session expired' });
        }

        req.user = decoded;
        req.authToken = token;

        // Attach per-request anon client for public queries (no user context)
        try {
            req.anonDb = getAnonClient();
        } catch {
            // anon key not configured — routes will fall back to serviceDb
        }

        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};
