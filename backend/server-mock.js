'use strict';
/**
 * server-mock.js — JobShield Ultimate Stable Demo Server
 *
 * USE THIS if the real server.js has any trouble during the pitch.
 * Every route returns a realistic mock response — the frontend
 * will never see an error, spinner, or blank screen.
 *
 * Start with:   node server-mock.js
 */

const express   = require('express');
const http      = require('http');
const cors      = require('cors');
const { Server: SocketIOServer } = require('socket.io');

// ─── Process-level crash immunity ─────────────────────────────────────────────
process.on('uncaughtException', (err) => {
    console.error('🔴 [UNCAUGHT EXCEPTION] Kept alive:', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('🟠 [UNHANDLED REJECTION] Kept alive:', reason instanceof Error ? reason.message : String(reason));
});

// ─── App setup ─────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const PORT   = 5000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Socket.io ────────────────────────────────────────────────────────────────
const io = new SocketIOServer(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
});

io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Health ping/pong
    socket.on('ping', () => socket.emit('pong', { status: 'ok', ts: Date.now() }));

    // Deep Trace mock — streams fake hops over WebSocket
    socket.on('start_deep_trace', ({ url } = {}) => {
        const target = url || 'https://example.com';
        console.log(`[DeepTrace MOCK] Tracing: ${target}`);

        socket.emit('scan_started',   { logLine: `[*] Starting deep trace on: ${target}` });
        socket.emit('engine_ready',   { logLine: '[*] Stealth browser initialised (mock mode).' });

        const mockHops = [
            { hopIndex: 1, url: target,                               riskLevel: 'clean',      riskScore: 5 },
            { hopIndex: 2, url: 'https://redirect1.ad-tracker.io',    riskLevel: 'suspicious',  riskScore: 42 },
            { hopIndex: 3, url: 'https://landing.offers-hub.net',     riskLevel: 'suspicious',  riskScore: 55 },
            { hopIndex: 4, url: 'https://final-destination.xyz/apply',riskLevel: 'malicious',   riskScore: 89 },
        ];

        let delay = 800;
        for (const hop of mockHops) {
            setTimeout(() => {
                socket.emit('hop_discovered', {
                    ...hop,
                    logLine: `[${hop.riskLevel === 'malicious' ? '✗' : '+'}] Hop ${hop.hopIndex}: ${hop.url}`,
                    riskSignals: hop.riskLevel === 'malicious'
                        ? ['Suspicious TLD (.xyz)', 'No HTTPS certificate', 'IP geoloc mismatch']
                        : [],
                });
            }, delay);
            delay += 900;
        }

        setTimeout(() => {
            socket.emit('threat_found', {
                hopIndex: 4,
                url: 'https://final-destination.xyz/apply',
                signals: ['Suspicious TLD (.xyz)', 'Domain age: 6 days', 'Phishing keyword in path'],
                logLine: '[✗] THREAT DETECTED at hop 4 — aborting trace.',
            });
        }, delay);

        setTimeout(() => {
            socket.emit('complete', {
                logLine:       '[✓] Scan complete.',
                terminalUrl:   'https://final-destination.xyz/apply',
                finalRiskLevel:'malicious',
                totalHops:     4,
                scanDurationMs:delay + 400,
                hops:          mockHops,
                terminalRisk: { signals: ['Phishing keyword in path','Suspicious TLD'] },
            });
        }, delay + 400);
    });

    socket.on('disconnect', () => console.log(`[Socket] Disconnected: ${socket.id}`));
});

// ─── REST: Health ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'JobShield MOCK API running', uptime: process.uptime() });
});

// ─── REST: /api/third-eye  (WHOIS mock) ──────────────────────────────────────
app.post('/api/third-eye', (req, res) => {
    try {
        const input  = String(req.body?.input || req.query?.input || '').trim();
        const domain = input.includes('@') ? input.split('@').pop() : input.replace(/https?:\/\//, '').split('/')[0];

        const FREE_EMAILS = new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com',
                                     'protonmail.com','yopmail.com','mailinator.com','rediffmail.com']);
        if (FREE_EMAILS.has(domain)) {
            return res.json({
                module: 'THE THIRD EYE', target: domain,
                creationDate: null, domainAgeDays: null,
                riskLevel: 'CRITICAL',
                verdict: 'Free/personal email provider detected. Legitimate corporate HR teams never use Gmail or Yahoo.',
                actionRecommended: 'BLOCK', analyzedAt: new Date().toISOString().slice(0,10),
            });
        }

        // Deterministic mock based on domain sum
        const KNOWN_SAFE = ['google','microsoft','amazon','apple','linkedin','infosys','wipro','tcs','accenture','ibm','oracle','github'];
        const base    = domain.split('.')[0].toLowerCase();
        const isSafe  = KNOWN_SAFE.some(k => base.includes(k));
        const charSum = domain.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
        const tier    = isSafe ? 0 : charSum % 3;
        const ages    = [1825, 90, 8];
        const age     = ages[tier];
        const date    = new Date(Date.now() - age * 86_400_000).toISOString().slice(0, 10);
        const labels  = [
            { riskLevel:'SAFE',     verdict:`Established entity — domain active for ${age} days. Consistent with a legitimate organisation.`, action:'PROCEED'  },
            { riskLevel:'ELEVATED', verdict:`Young domain (${age} days old). Registered recently — verify company identity before proceeding.`,  action:'VERIFY'  },
            { riskLevel:'CRITICAL', verdict:`Ghost domain — only ${age} days old. Extremely high probability of scam or fraud.`,                action:'BLOCK'   },
        ];

        res.json({
            module: 'THE THIRD EYE', target: domain,
            creationDate: date, domainAgeDays: age,
            ...labels[tier],
            analyzedAt: new Date().toISOString().slice(0, 10),
            note: 'Demo mode — result estimated from domain characteristics.',
        });
    } catch(e) {
        console.error('[ThirdEye mock error]', e.message);
        res.json({ module:'THE THIRD EYE', target:'unknown', riskLevel:'UNKNOWN',
            verdict:'Analysis unavailable.', actionRecommended:'MANUAL_REVIEW',
            creationDate:null, domainAgeDays:null, analyzedAt:new Date().toISOString().slice(0,10) });
    }
});
app.get('/api/third-eye', (req, res) => { req.body = {}; res.redirect(307, '/api/third-eye'); });

// ─── REST: /api/analyze  (Job Intelligence mock) ─────────────────────────────
app.post('/api/analyze', (req, res) => {
    try {
        const text   = String(req.body?.jobText || req.body?.text || '').toLowerCase();
        const salary = parseFloat(req.body?.salary) || 0;

        const hasScamSignals = /security deposit|registration fee|whatsapp only|act immediately|data entry.*earn.*\$[0-9]{3,}/i.test(text);
        const hasGmailHr     = /hr@gmail|recruit@yahoo/i.test(text);

        const riskScore = hasScamSignals ? 82 : hasGmailHr ? 55 : 12;

        res.json({
            success: true,
            riskScore,
            riskLevel:    riskScore >= 60 ? 'HIGH_RISK' : riskScore >= 30 ? 'MID_RISK' : 'SAFE',
            detectedFlags: hasScamSignals
                ? ['Security deposit demand detected', 'Urgency manipulation phrase detected', 'WhatsApp-only contact']
                : hasGmailHr
                ? ['Personal email used by HR contact']
                : [],
            trustSignals: hasScamSignals ? [] : ['No financial pre-conditions', 'Standard corporate language detected'],
            confidence: 91,
            verdict: riskScore >= 60 ? 'High probability of fraud — do NOT apply.'
                   : riskScore >= 30 ? 'Several suspicious signals — verify before applying.'
                   : 'Appears legitimate — standard due diligence recommended.',
        });
    } catch(e) {
        console.error('[Analyze mock error]', e.message);
        res.json({ success:true, riskScore:0, riskLevel:'SAFE', detectedFlags:[], trustSignals:[], confidence:50, verdict:'Analysis completed.' });
    }
});

// ─── REST: /api/resume  (Resume Scorer mock) ─────────────────────────────────
app.post('/api/resume/score', (req, res) => {
    try {
        res.json({
            success: true,
            atsScore: 74,
            finalScore: 74,
            wordCount: 420,
            logicCategory: 'Moderate',
            strengths: [
                'Strong Tech-Stack Cohesion: Frontend + Backend + Database all present.',
                '3 S.T.A.R. bullets with quantified metrics detected.',
                'Resume length within optimal ATS range (350–700 words).',
            ],
            topSuggestions: [
                'Add a quantified metric to your Node.js bullet — e.g., "handling 10k req/sec".',
                'AWS skills appear only in Skills section — move to an Experience bullet for full ATS credit.',
            ],
            flaggedAnomalies: [],
        });
    } catch(e) {
        res.json({ success:true, atsScore:65, finalScore:65, wordCount:300, logicCategory:'Moderate', strengths:[], topSuggestions:[], flaggedAnomalies:[] });
    }
});

// ─── REST: Auth stubs (so frontend doesn't 404) ───────────────────────────────
app.post('/api/auth/login', (req, res) => {
    const { email = 'demo@jobshield.ai', password = '' } = req.body || {};
    res.json({
        success: true,
        token: 'mock_jwt_token_for_demo_' + Date.now(),
        user: { username: 'DemoUser', email, id: 'mock_user_001' },
    });
});
app.post('/api/auth/register', (req, res) => {
    const { username='DemoUser', email='demo@jobshield.ai' } = req.body || {};
    res.json({
        success: true,
        token: 'mock_jwt_token_for_demo_' + Date.now(),
        user: { username, email, id: 'mock_user_001' },
    });
});
app.get('/api/auth/me', (req, res) => {
    res.json({ success:true, user:{ username:'DemoUser', email:'demo@jobshield.ai', id:'mock_user_001' } });
});

// ─── 404 catch-all ────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found in mock server.` });
});

// ─── Global Express error handler ─────────────────────────────────────────────
app.use((err, req, res, _next) => { // eslint-disable-line no-unused-vars
    console.error('[Express Error]', err.message);
    res.status(200).json({ success:true, message:'Handled gracefully.', error: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`\n🚀 Ultimate Stable Server running on port ${PORT}`);
    console.log(`   REST  → http://localhost:${PORT}/api/health`);
    console.log(`   WS    → ws://localhost:${PORT}  (ping/pong + deep-trace)`);
    console.log(`   Mode  → MOCK (all modules return simulated data)\n`);
});
