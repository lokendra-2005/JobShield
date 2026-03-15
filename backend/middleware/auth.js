const jwt = require('jsonwebtoken');
const { verifyToken } = require('../services/tokenService');

// Hand-rolling this instead of using express-jwt because the library
// adds 3kb of deps and we only need two things: extract the token and verify it.
// Also had a bad experience with express-jwt v6 → v7 breaking changes eating 2 days.

module.exports = function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'No auth token provided. Please log in.',
        });
    }

    const rawToken = authHeader.split(' ')[1];

    try {
        const decodedPayload = verifyToken(rawToken);
        req.user = decodedPayload;
        next();
    } catch (tokenErr) {
        // Splitting these two because the frontend handles them differently:
        // expired → show "session expired, please log in again"
        // malformed → show generic "invalid token" (could be tampering)
        if (tokenErr instanceof jwt.TokenExpiredError) {
            return res.status(401).json({
                success: false,
                message: 'Session expired. Please log in again.',
            });
        }

        if (tokenErr instanceof jwt.JsonWebTokenError) {
            // TODO: log suspicious requests to a security audit table at some point
            console.warn('[Auth Middleware] Malformed or tampered token received:', rawToken?.slice(0, 20), '...');
            return res.status(401).json({
                success: false,
                message: 'Invalid token. Please log in again.',
            });
        }

        // Catch-all for unexpected JWT errors — shouldn't happen but don't swallow it silently
        console.error('[Auth Middleware] Unexpected token verification error:', tokenErr.message);
        return res.status(401).json({
            success: false,
            message: 'Token verification failed. Please log in.',
        });
    }
};
