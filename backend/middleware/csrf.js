export const csrfProtection = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    // Only unauthenticated public endpoints are exempt from CSRF checks.
    // Authenticated state-changing endpoints (/api/auth/me, /api/auth/logout) require X-Requested-With.
    const csrfExemptPaths = new Set([
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/forgot-password'
    ]);

    const pathname = (req.originalUrl || req.url || '').split('?')[0].replace(/\/+$/, '');
    if (csrfExemptPaths.has(pathname)) {
        return next();
    }

    const requestedWith = req.headers['x-requested-with'];
    if (requestedWith !== 'XMLHttpRequest') {
        console.warn(`[CSRF] Blocked ${req.method} ${req.url} — missing X-Requested-With header`);
        return res.status(403).json({ error: 'CSRF validation failed' });
    }

    next();
};
