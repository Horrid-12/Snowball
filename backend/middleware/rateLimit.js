const store = new Map();

// Periodic cleanup of expired entries (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of store.entries()) {
        if (value.resetAt <= now) {
            store.delete(key);
        }
    }
}, 5 * 60 * 1000);

export const createRateLimiter = ({ windowMs, maxRequests, message }) => {
    return async (req, res, next) => {
        const now = Date.now();
        const key = `${req.ip}:${req.baseUrl}${req.path}`;
        
        try {
            let current = store.get(key);
            if (!current || current.resetAt <= now) {
                current = { count: 1, resetAt: now + windowMs };
                store.set(key, current);
                return next();
            }

            if (current.count >= maxRequests) {
                const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
                res.setHeader('Retry-After', retryAfterSeconds);
                return res.status(429).json({ error: { message } });
            }

            current.count += 1;
            return next();
        } catch (error) {
            // Fail open — allow the request to proceed if anything goes wrong
            console.error('Rate Limiter Error (fail-open):', error.message);
            return next();
        }
    };
};

// General API rate limiter: 100 requests per 15 min per IP+path
export const generalRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 100,
    message: 'Too many requests. Please slow down.'
});
