const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidUUID = (value) => UUID_RE.test(value);

export const requireUUID = (paramName, source = 'params') => (req, res, next) => {
    const value = source === 'body' ? req.body?.[paramName] : req.params?.[paramName];
    if (!value || !UUID_RE.test(String(value))) {
        return res.status(400).json({ error: `Invalid ${paramName}: must be a valid UUID` });
    }
    next();
};

export const requireString = (paramName, { maxLength = Infinity, minLength = 1, source = 'body' } = {}) =>
    (req, res, next) => {
        const value = source === 'params' ? req.params?.[paramName] : req.query?.[paramName] || req.body?.[paramName];
        if (!value || typeof value !== 'string' || value.trim().length < minLength) {
            return res.status(400).json({ error: `${paramName} is required` });
        }
        if (value.trim().length > maxLength) {
            return res.status(400).json({ error: `${paramName} must be at most ${maxLength} characters` });
        }
        next();
    };

export const requireNumber = (paramName, { min, max, source = 'body' } = {}) =>
    (req, res, next) => {
        const raw = source === 'params' ? req.params?.[paramName] : source === 'query' ? req.query?.[paramName] : req.body?.[paramName];
        const num = Number(raw);
        if (!Number.isFinite(num)) {
            return res.status(400).json({ error: `${paramName} must be a number` });
        }
        if (min !== undefined && num < min) {
            return res.status(400).json({ error: `${paramName} must be at least ${min}` });
        }
        if (max !== undefined && num > max) {
            return res.status(400).json({ error: `${paramName} must be at most ${max}` });
        }
        next();
    };
