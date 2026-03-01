/**
 * Error Handling Middleware
 *
 * Catches unhandled errors thrown in route handlers or other middleware
 * and returns a consistent JSON error response.
 */

/**
 * Express error-handling middleware (4-argument signature).
 * Logs the error stack in development and returns a clean JSON response.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    // Log full error in development
    if (process.env.NODE_ENV !== 'production') {
        console.error('[Error]', err.stack || err);
    }

    res.status(statusCode).json({
        error: {
            message,
            ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
        },
    });
}
