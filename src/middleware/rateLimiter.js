/**
 * @fileoverview Rate-limiting middleware for OUR server's public endpoints.
 * This is distinct from the retry/backoff logic in utils/httpClient.js,
 * which handles rate limits imposed ON us BY upstream APIs. This module
 * protects our own server from being hammered by any single client.
 *
 * Uses `express-rate-limit` (declared in package.json).
 */

const rateLimit = require("express-rate-limit");
const config = require("../config");

const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: true,
    message: "Too many requests. Please slow down and try again shortly.",
    code: "CLIENT_RATE_LIMITED",
  },
});

module.exports = { apiLimiter };
