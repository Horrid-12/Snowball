export const createRateLimiter = ({ windowMs, maxRequests, message }) => {
    const store = new Map();

    const pruneExpiredEntries = (now) => {
        for (const [key, entry] of store.entries()) {
            if (entry.resetAt <= now) {
                store.delete(key);
            }
        }
    };

    return (req, res, next) => {
        const now = Date.now();
        pruneExpiredEntries(now);

        const key = `${req.ip}:${req.baseUrl}${req.path}`;
        const current = store.get(key);

        if (!current || current.resetAt <= now) {
            store.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }

        if (current.count >= maxRequests) {
            const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
            res.setHeader('Retry-After', retryAfterSeconds);
            return res.status(429).json({ error: { message } });
        }

        current.count += 1;
        store.set(key, current);
        return next();
    };
};

// General API rate limiter: 100 requests per 15 min per IP+path
export const generalRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 100,
    message: 'Too many requests. Please slow down.'
});
