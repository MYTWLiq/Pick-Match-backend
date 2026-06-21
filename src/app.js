/**
 * @fileoverview Builds and exports the Express app itself — no `.listen()`
 * call here. This split exists so the exact same app can run two ways:
 *   - Locally / on a traditional host: server.js requires this and calls listen().
 *   - On Vercel (serverless): api/index.js requires this directly. Vercel's
 *     Node runtime invokes the exported Express app per-request instead of
 *     binding a port, so listen() must never be called in that path.
 *
 * Boot order matters here:
 *   1. Security/parsing middleware (helmet, cors, json body parsing).
 *   2. Our own rate limiter (protects this server, distinct from upstream rate limits).
 *   3. Routes.
 *   4. 404 handler, then the error handler — both must be registered LAST.
 */

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");

const config = require("./config");
const { apiLimiter } = require("./middleware/rateLimiter");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const recommendationsRouter = require("./routes/recommendations");

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
app.use("/api", apiLimiter);

app.get("/health", (req, res) => {
  res.json({ ok: true, env: config.nodeEnv });
});

app.use("/api", recommendationsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
