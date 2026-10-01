const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { fail } = require('../utils/http');

/**
 * API rate limiting — three tiers:
 *   global   every /api request (generous ceiling, abuse brake)
 *   auth     /api/login (brute-force brake)
 *   public   /api/public/* (anonymous endpoints, no scope header required)
 *   ai       /api/assistant/chat (each call hits a paid-ish upstream model)
 *
 * Every 429 keeps the { success, error } envelope the frontend expects and
 * surfaces a Retry-After header so a client can wait it out.
 */
const message = (error) => (req, res) => fail(res, error, 429);

const jsonOnly = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  return next();
};

// 300 requests / 15 min per IP across the whole API — far above any realistic
// human session, low enough to blunt scripted floods.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: message('Too many requests. Please slow down and try again shortly.'),
});

// 10 login attempts / 15 min per IP — brute-force brake.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: message('Too many sign-in attempts. Please wait a few minutes and try again.'),
});

// 30 requests / 10 min per IP on the anonymous public endpoints.
const publicLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: message('Too many requests from this network. Please try again later.'),
});

// 20 AI messages / 10 min per role-scoped identity (falls back to IP).
const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const s = req.scope || {};
    // ipKeyGenerator hashes IPv6 properly so a /64 can't share one bucket.
    return s.student_id || s.trainer_id || s.customer_id || ipKeyGenerator(req.ip);
  },
  handler: message('Mira AI is rate limited right now. Please wait a moment and try again.'),
});

module.exports = { globalLimiter, authLimiter, publicLimiter, aiLimiter, jsonOnly };
