const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');

// GET /api/me — returns user profile + role
router.get('/me', authenticate, (req, res) => {
  res.json({
    user: { name: req.user.name, email: req.user.email },
    role: req.user.role
  });
});

// GET /api/health
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'smartprocure-backend', timestamp: new Date().toISOString() });
});

module.exports = router;
