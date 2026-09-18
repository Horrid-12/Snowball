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
    const isServerError = statusCode >= 500;
    const isProduction = process.env.NODE_ENV === 'production';

    // Log error on server side
    if (!isProduction) {
        console.error('[Error]', err.stack || err);
    } else if (isServerError) {
        console.error('[ServerError]', err.message || err);
    }

    // In production, mask internal 5xx error messages to prevent leaking system/db details
    const message = (isServerError && isProduction)
        ? 'Internal Server Error'
        : (err.message || 'Internal Server Error');

    res.status(statusCode).json({
        error: {
            message,
            ...(!isProduction && { stack: err.stack }),
        },
    });
}
