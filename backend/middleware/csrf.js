export const csrfProtection = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    if (req.url.startsWith('/api/auth/')) {
        return next();
    }

    const requestedWith = req.headers['x-requested-with'];
    if (requestedWith !== 'XMLHttpRequest') {
        console.warn(`[CSRF] Blocked ${req.method} ${req.url} — missing X-Requested-With header`);
        return res.status(403).json({ error: 'CSRF validation failed' });
    }

    next();
};
