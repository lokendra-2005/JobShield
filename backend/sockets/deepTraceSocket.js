'use strict';

// Socket.io handler for Deep Trace scans.
// Graceful auth: token is optional — missing/invalid token connects as guest.
// This stops WebSocket disconnects during demos when tokens expire or aren't sent.

const jwt = require('jsonwebtoken');
const { runDeepTrace } = require('../services/deepTraceEngine');

/**
 * registerDeepTraceSockets(io)
 * Call this once during server startup, passing the socket.io Server instance.
 */
function registerDeepTraceSockets(io) {

    // Namespace: /deep-trace — keeps these events isolated from any future WS features
    const ns = io.of('/deep-trace');

    // ── Auth middleware (runs on every connection to this namespace) ──────────
    // Graceful: verify JWT if present but NEVER block the connection.
    // Missing/invalid token → connect as guest. Prevents WebSocket disconnects
    // when a user's token expires mid-session or isn't sent during demo.
    ns.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) {
            // No JWT — allow as guest (scan still works)
            socket.user = { id: 'guest', role: 'guest' };
            return next();
        }
        try {
            socket.user = jwt.verify(token, process.env.JWT_SECRET);
            next();
        } catch (jwtErr) {
            // Invalid token — log but still allow as guest
            console.warn(`[DeepTrace] Token invalid (${jwtErr.message}) — connecting as guest`);
            socket.user = { id: 'guest', role: 'guest' };
            next();
        }
    });

    ns.on('connection', (socket) => {
        const userId = socket.user?.id || socket.user?._id || 'guest';
        console.log(`[DeepTrace] Client connected — user: ${userId} | socket: ${socket.id}`);

        // ── Global error guard — prevents one bad URL from crashing the namespace ──
        socket.on('error', (err) => {
            console.error('[DeepTrace] Socket error:', err?.message);
        });

        // ── Event: start_deep_trace ───────────────────────────────────────────
        socket.on('start_deep_trace', async (payload) => {
            const { url } = payload || {};

            // Basic URL validation
            if (!url || typeof url !== 'string' || url.trim().length < 4) {
                socket.emit('error_event', {
                    message: 'Invalid URL — please provide a full URL including https://',
                    logLine: '[✗] Invalid URL provided.',
                });
                return;
            }

            // Add protocol if missing (user might paste "example.com")
            let sanitisedUrl = url.trim();
            if (!/^https?:\/\//i.test(sanitisedUrl)) {
                sanitisedUrl = 'https://' + sanitisedUrl;
            }

            console.log(`[DeepTrace] Scan started — user: ${userId} | url: ${sanitisedUrl}`);

            // Emit a confirmation so the frontend can immediately switch to scanning phase
            socket.emit('scan_started', {
                url: sanitisedUrl,
                logLine: `[*] Initialising Deep Trace for: ${sanitisedUrl}`,
                timestamp: new Date().toISOString(),
            });

            // The emit callback — bridges engine events to socket events
            const emitToClient = (event, data) => {
                // If the socket disconnected mid-scan, silently skip
                if (!socket.connected) return;
                try {
                    socket.emit(event, data);
                } catch (emitErr) {
                    console.warn(`[DeepTrace] emit(${event}) failed:`, emitErr.message);
                }
            };

            try {
                await runDeepTrace(sanitisedUrl, emitToClient);
                // 'complete' event is emitted by the engine itself via emitToClient
            } catch (engineErr) {
                console.error(`[DeepTrace] Engine error for ${sanitisedUrl}:`, engineErr.message);
                socket.emit('error_event', {
                    message: `Scan failed: ${engineErr.message}`,
                    logLine: `[✗] Fatal error during trace: ${engineErr.message}`,
                });
            }
        });

        socket.on('disconnect', (reason) => {
            console.log(`[DeepTrace] Client disconnected — ${socket.id} | reason: ${reason}`);
        });
    });

    return ns;
}

module.exports = { registerDeepTraceSockets };
