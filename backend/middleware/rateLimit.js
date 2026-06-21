import { supabase } from '../db.js';

export const createRateLimiter = ({ windowMs, maxRequests, message }) => {
    return async (req, res, next) => {
        const now = Date.now();
        const key = `${req.ip}:${req.baseUrl}${req.path}`;

        try {
            // Prune expired entries in the background (5% probability to avoid DB spam)
            if (Math.random() < 0.05) {
                supabase.rpc('prune_expired_rate_limits').then(({ error }) => {
                    if (error) console.error('Failed to prune rate limits:', error.message);
                });
            }

            // Fetch the current rate limit entry for this key
            const { data: current } = await supabase
                .from('rate_limits')
                .select('count, reset_at')
                .eq('key', key)
                .maybeSingle();

            if (!current || current.reset_at <= now) {
                // Insert or overwrite expired entry
                await supabase
                    .from('rate_limits')
                    .upsert({ key, count: 1, reset_at: now + windowMs }, { onConflict: 'key' });
                return next();
            }

            if (current.count >= maxRequests) {
                const retryAfterSeconds = Math.ceil((current.reset_at - now) / 1000);
                res.setHeader('Retry-After', retryAfterSeconds);
                return res.status(429).json({ error: { message } });
            }

            // Increment the count
            await supabase
                .from('rate_limits')
                .update({ count: current.count + 1 })
                .eq('key', key);
                
            return next();
        } catch (error) {
            // Fail open — if Supabase is down, allow the request to proceed
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
