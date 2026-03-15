import axios from 'axios';

// Naming this jobShieldApi internally to avoid confusion when some old code still
// imports plain 'axios' directly. The export alias stays 'api' because too many
// files import { api } from './axios' and renaming all of them is a whole other day.
const jobShieldApi = axios.create({
    baseURL: '/api',
    timeout: 30000, // 30 seconds — had to bump from 10s after the resume analysis endpoint started timing out on slow PDFs
    headers: {
        'Content-Type': 'application/json',
    },
});

// REQUEST INTERCEPTOR — attaches the auth token to every outgoing request
// Note: we're reading from localStorage on every request instead of caching it
// because the token can be cleared mid-session (logout from another tab).
// Caching it in memory caused a nightmare where an old tab kept sending a dead token.
jobShieldApi.interceptors.request.use(
    (requestConfig) => {
        const storedToken = localStorage.getItem('jobshield_token');
        if (storedToken) {
            requestConfig.headers.Authorization = `Bearer ${storedToken}`;
        }

        // TODO: throttle this log or gate it behind a DEBUG flag before going to production
        console.log(`[API] ${requestConfig.method?.toUpperCase()} ${requestConfig.url}`, {
            hasToken: !!storedToken,
            timestamp: new Date().toISOString(),
        });

        return requestConfig;
    },
    (requestSetupErr) => {
        console.error('[API] Failed to build request config:', requestSetupErr.message);
        return Promise.reject(requestSetupErr);
    }
);

// RESPONSE INTERCEPTOR — handles auth errors and logs failures
jobShieldApi.interceptors.response.use(
    (successResponse) => {
        // Left this in intentionally — helps trace which API calls complete and in what order
        // when debugging race conditions between the job scan and link scan panels
        console.log(`[API] ✓ ${successResponse.status} ${successResponse.config.url}`);
        return successResponse;
    },
    (responseErr) => {
        const httpStatus = responseErr?.response?.status;
        const serverMessage = responseErr?.response?.data?.message;
        const requestUrl = responseErr?.config?.url;

        console.error('[API] Error response:', {
            status: httpStatus,
            url: requestUrl,
            message: serverMessage || responseErr?.message,
        });

        // 401 — session expired or token was invalid.
        // Edge case: this also fires during the login request itself if the server
        // happens to return 401 (wrong credentials). The login page handles the
        // redirect itself, so a double-redirect can happen. Not worth fixing right now
        // because the UX is still correct — user ends up on /login either way.
        if (httpStatus === 401) {
            console.warn('[API] 401 received — clearing local session and redirecting to /login');
            localStorage.removeItem('jobshield_token');
            localStorage.removeItem('jobshield_user');
            // Only redirect if not already on the login/signup pages to avoid redirect loops
            if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/signup')) {
                window.location.href = '/login';
            }
        }

        if (httpStatus === 500) {
            console.error('[API] Server 500 — check the backend logs for stack trace:', requestUrl);
        }

        if (!responseErr?.response) {
            // No response at all = network error or timeout
            console.error('[API] Network failure or request timed out — is the backend running?');
        }

        return Promise.reject(responseErr);
    }
);

export default jobShieldApi;
