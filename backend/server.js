const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Server: SocketIOServer } = require('socket.io');
require('dotenv').config();

const { connectDB } = require('./config/db');
const { ALLOWED_ORIGINS } = require('./config/constants');
const authRoutes = require('./routes/auth');
const resumeRoutes = require('./routes/resume');
const analyzeRoutes = require('./routes/analyze');
const { registerDeepTraceSockets } = require('./sockets/deepTraceSocket');

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Socket.io — attach to the same http server so it shares the port
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',       // wildcard — allow any Vite/CRA port during dev
    methods: ['GET', 'POST'],
    credentials: false, // must be false when origin is '*'
  },
  transports: ['websocket', 'polling'],
  pingTimeout:  60_000,
  pingInterval: 25_000,
});

// Register the /deep-trace namespace & event handlers
registerDeepTraceSockets(io);

// Sanity check — burned 20 minutes once wondering why API calls 404'd in dev
// before realising the port env var wasn't being picked up
console.log('Server config loaded — PORT:', PORT);

// CORS — had to add localhost:3000 after the hackathon demo used CRA instead of Vite
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));

// 10mb limit because some users paste full JSON objects in the job text field
// and the default 100kb blew up on them with a cryptic 413
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving for uploaded resumes
// Note: in prod we'd move to S3 but for now disk storage + static serve works
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/analyze', analyzeRoutes);

// Quick health endpoint — useful for uptime monitoring and deployment verification
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'JobShield API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Global error handler — must be last, must have 4 params for Express to treat it as an error handler
// Spent an hour debugging why errors weren't being caught before noticing I had 3 params
app.use((err, req, res, next) => {  // eslint-disable-line no-unused-vars
  console.error('[Server] Unhandled error hit global handler:', err.message || err);
  res.setHeader('Content-Type', 'application/json');
  res.status(err.status || 500).json({
    success: false,
    riskScore: 0,
    riskLevel: 'ERROR',
    detectedFlags: ['Internal server error — check server logs'],
    trustSignals: [],
    confidence: 0,
    message: err.message || 'Something broke on our end. Please try again.',
  });
});

// ─── Process-Level Crash Guards ────────────────────────────────────────────────
// These two handlers catch ANYTHING that escapes route/controller try-catch blocks.
// They LOG the error and keep the process alive — the server NEVER dies from an API bug.

process.on('uncaughtException', (err) => {
  console.error('🔴 [UNCAUGHT EXCEPTION] Server kept alive. Error details:');
  console.error('   Name   :', err.name);
  console.error('   Message:', err.message);
  console.error('   Stack  :', err.stack?.split('\n').slice(0, 4).join('\n   '));
  // Do NOT call process.exit() — server lives on
});

process.on('unhandledRejection', (reason) => {
  console.error('🟠 [UNHANDLED REJECTION] Server kept alive. Reason:');
  console.error('  ', reason instanceof Error ? reason.message : String(reason));
  // Do NOT call process.exit() — server lives on
});

// ─── Safe async route wrapper ───────────────────────────────────────────────────
// Usage: app.get('/route', asyncWrap(async (req, res) => { ... }))
// Catches any thrown error inside the handler and forwards to Express error handler.
function asyncWrap(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
// Export so controllers can use it too
app.locals.asyncWrap = asyncWrap;

// Boot sequence — DB first, then HTTP server.
// startServer() is recursive: if a port is busy it just calls itself with port+1.
// Removing stale 'error' listeners before each retry prevents ERR_SERVER_ALREADY_LISTEN.
connectDB()
  .then(() => {
    const BASE_PORT = parseInt(process.env.PORT || 5000, 10);

    function startServer(port) {
      // Clean up any listener left over from a previous failed attempt
      httpServer.removeAllListeners('error');
      httpServer.removeAllListeners('listening');

      httpServer
        .listen(port, () => {
          const p = httpServer.address().port;
          console.log(`✅ JobShield server running on http://localhost:${p}`);
          console.log(`⚡ Socket.io Deep Trace active at ws://localhost:${p}/deep-trace`);
          if (p !== BASE_PORT) {
            console.log(`   ℹ  ${BASE_PORT} was busy — using ${p} instead.`);
          }
        })
        .on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️  Port ${port} is busy, trying ${port + 1}...`);
            startServer(port + 1);   // recurse cleanly — no double-bind
          } else {
            console.error('❌ Server error:', err.message);
            process.exit(1);
          }
        });
    }

    startServer(BASE_PORT);
  })
  .catch((dbErr) => {
    console.error('❌ Failed to connect to MongoDB:', dbErr.message);
    process.exit(1);
  });

