import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

// 30 min inactivity timeout — feels right for a security tool.
// We lose the occasional user who walks away from their desk but that's the trade-off.
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Events that count as "user is active" — not using 'input' here because
// autofill triggers it constantly and resets the timer even when nobody is at the keyboard
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'click'];

// localStorage and sessionStorage key names — keep in sync with backend/config/constants.js
// and api/axios.js. Yes there are 3 places. We know. It's on the refactor list.
const TOKEN_STORAGE_KEY = 'jobshield_token';
const USER_STORAGE_KEY = 'jobshield_user';
const SESSION_FLAG_KEY = 'jobshield_session_active';

function clearStoredSession() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_FLAG_KEY);
}

function markSessionAsActive() {
    sessionStorage.setItem(SESSION_FLAG_KEY, '1');
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const inactivityTimerRef = useRef(null);

    const logout = useCallback(() => {
        clearStoredSession();
        setUser(null);
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    }, []);

    // Resets the 30-min countdown on every user interaction.
    // The timer ref approach avoids re-creating this callback on each render.
    const resetInactivityTimer = useCallback(() => {
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = setTimeout(() => {
            console.warn('[AuthContext] User inactive for 30 minutes — forcing logout');
            logout();
            window.location.replace('/login');
        }, SESSION_TIMEOUT_MS);
    }, [logout]);

    // Session restore on page load.
    // The sessionStorage trick: localStorage persists across browser closes,
    // but sessionStorage is cleared when the tab/window closes. So we use
    // sessionStorage as a "is this tab fresh?" flag. If the flag is missing,
    // the user reopened a closed browser and we force re-login for security.
    useEffect(() => {
        const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
        const savedUserJson = localStorage.getItem(USER_STORAGE_KEY);
        const sessionIsAlive = sessionStorage.getItem(SESSION_FLAG_KEY);

        if (savedToken && savedUserJson && sessionIsAlive) {
            try {
                const parsedUser = JSON.parse(savedUserJson);
                console.log('DEBUG [AuthContext] Restoring session for user:', parsedUser?.username);
                setUser(parsedUser);
                resetInactivityTimer();
            } catch (jsonParseErr) {
                // Corrupted JSON in localStorage — clear it out
                console.warn('[AuthContext] Failed to parse stored user JSON, clearing session:', jsonParseErr.message);
                clearStoredSession();
            }
        } else if (savedToken && savedUserJson && !sessionIsAlive) {
            // Browser was closed and reopened — intentionally forcing re-auth
            console.info('[AuthContext] Session flag missing — browser was likely closed. Clearing previous session.');
            clearStoredSession();
        }

        setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Attach activity listeners only when user is logged in — no point tracking
    // activity on the landing page or login screen
    useEffect(() => {
        if (!user) return;

        ACTIVITY_EVENTS.forEach(evtName => window.addEventListener(evtName, resetInactivityTimer, { passive: true }));
        resetInactivityTimer();

        return () => {
            ACTIVITY_EVENTS.forEach(evtName => window.removeEventListener(evtName, resetInactivityTimer));
            if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        };
    }, [user, resetInactivityTimer]);

    // Clear sessionStorage flag when tab is actually closing (not just hidden).
    // This is how we detect "browser closed" on next open — see session restore block above.
    useEffect(() => {
        if (!user) return;

        const handleTabClose = () => {
            sessionStorage.removeItem(SESSION_FLAG_KEY);
        };

        window.addEventListener('beforeunload', handleTabClose);
        return () => window.removeEventListener('beforeunload', handleTabClose);
    }, [user]);

    // Cross-tab logout — if another tab removes the token from localStorage,
    // this tab picks up the storage event and clears user state too
    useEffect(() => {
        const handleCrossTabLogout = (storageEvt) => {
            if (storageEvt.key === TOKEN_STORAGE_KEY && !storageEvt.newValue) {
                console.info('[AuthContext] Token removed in another tab — logging out this tab too');
                setUser(null);
            }
        };
        window.addEventListener('storage', handleCrossTabLogout);
        return () => window.removeEventListener('storage', handleCrossTabLogout);
    }, []);

    const register = useCallback(async (username, email, password) => {
        const { data: authPayload } = await api.post('/auth/register', { username, email, password });
        localStorage.setItem(TOKEN_STORAGE_KEY, authPayload.token);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(authPayload.user));
        markSessionAsActive();
        setUser(authPayload.user);
        resetInactivityTimer();
        return authPayload;
    }, [resetInactivityTimer]);

    const login = useCallback(async (email, password) => {
        const { data: authPayload } = await api.post('/auth/login', { email, password });
        localStorage.setItem(TOKEN_STORAGE_KEY, authPayload.token);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(authPayload.user));
        markSessionAsActive();
        setUser(authPayload.user);
        resetInactivityTimer();
        return authPayload;
    }, [resetInactivityTimer]);

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, register }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth() called outside of AuthProvider — wrap your component tree in <AuthProvider>');
    return ctx;
}
