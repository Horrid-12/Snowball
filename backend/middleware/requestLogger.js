/**
 * Request Logger Middleware
 *
 * Logs incoming HTTP requests with method, URL, and response time
 * for debugging and monitoring purposes.
 */

/**
 * Logs each incoming request and its response time to the console.
 */
export function requestLogger(req, res, next) {
    const start = Date.now();

    // Log after the response finishes
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(
            `  ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`
        );
    });

    next();
}
