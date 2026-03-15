const jwt = require('jsonwebtoken');
const { AUTH_TOKEN_EXPIRY } = require('../config/constants');

// Moved JWT sign/verify out of the route files after the auth middleware and
// the auth route were both calling jwt.sign() with slightly different option objects.
// Found out the hard way that one was missing { algorithm: 'HS256' } — tokens were
// silently accepted anyway because HS256 is the default, but still made me paranoid.

function signUserToken(userId) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        // This actually crashed in prod once because the .env wasn't deployed.
        // Now we blow up early with something human-readable.
        throw new Error('JWT_SECRET env var is missing — cannot sign tokens. Check deployment config.');
    }
    return jwt.sign({ id: userId }, secret, { expiresIn: AUTH_TOKEN_EXPIRY });
}

// verifyToken is used by the auth middleware — separated here so we can
// import it in tests without needing the full Express router in scope
function verifyToken(token) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET env var is missing — cannot verify tokens.');
    }
    // Note: jwt.verify throws on failure — callers must handle TokenExpiredError
    // and JsonWebTokenError separately if they want different behaviour per error type
    return jwt.verify(token, secret);
}

module.exports = { signUserToken, verifyToken };
