// SmartProcure backend — Express bootstrap
// Validates Azure AD id tokens against the tenant JWKS endpoint
// and serves the /api/* routes consumed by the Vue SPA.

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const morgan  = require('morgan');

const authRoutes = require('./routes/auth.routes');

const app  = express();
const PORT = process.env.PORT || 4000;

// --- Security + platform middleware ---
app.use(helmet());
app.use(cors({
  // Comma-separated allowlist, e.g. "https://smartprocure.example.com,http://localhost:5173"
  origin: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// --- Liveness / readiness (k8s probes hit this before auth kicks in) ---
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', service: 'smartprocure-backend', ts: new Date().toISOString() });
});

// --- API routes ---
app.use('/api', authRoutes);

// --- 404 ---
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

// --- Error handler ---
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

app.listen(PORT, () => {
  console.log(`SmartProcure backend listening on :${PORT}`);
});

module.exports = app;
