// Centralising magic values here after the third time someone hardcoded
// 'jobshield_token' in a different file and we got a mismatch bug in staging.
// If you rename a key here, grep for it across the whole project — the frontend
// has its own copy in api/axios.js that also needs updating.

const AUTH_TOKEN_EXPIRY = '7d';

// 30 min feels right for a security app — LinkedIn does 60 min but they can afford
// the support tickets from "why am I logged out". We can't.
const SESSION_TIMEOUT_MINUTES = 30;

// Multer upload limits
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB — bumped from 2MB after users complained about DOCX files

const ALLOWED_RESUME_MIMETYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
];

// Storage key names — keep in sync with frontend/src/api/axios.js and AuthContext.jsx
// TODO: at some point move these into a shared /common package if we ever monorepo this
const LOCALSTORAGE_TOKEN_KEY = 'jobshield_token';
const LOCALSTORAGE_USER_KEY = 'jobshield_user';
const SESSIONSTORAGE_ACTIVE_KEY = 'jobshield_session_active';

// CORS origins — covers all Vite fallback ports (5173→5175) + CRA port 3000
// Vite auto-increments if a port is busy, so we allow all three just in case
const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
];

module.exports = {
    AUTH_TOKEN_EXPIRY,
    SESSION_TIMEOUT_MINUTES,
    MAX_UPLOAD_SIZE_BYTES,
    ALLOWED_RESUME_MIMETYPES,
    LOCALSTORAGE_TOKEN_KEY,
    LOCALSTORAGE_USER_KEY,
    SESSIONSTORAGE_ACTIVE_KEY,
    ALLOWED_ORIGINS,
};
