/**
 * @fileoverview Vercel serverless entry point.
 * Vercel auto-detects any file under /api as a function. This one simply
 * hands every request to the real Express app (src/app.js) — no .listen(),
 * Vercel's Node runtime calls the exported app directly per-request.
 */
module.exports = require("../src/app");
