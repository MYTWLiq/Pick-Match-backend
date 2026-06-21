/**
 * @fileoverview Centralized Express error-handling middleware.
 *
 * Every route handler in this app is wrapped with `asyncHandler` (see
 * routes/recommendations.js), which forwards thrown/rejected errors to
 * `next(err)`. This is the single place those errors land.
 *
 * - AppError (and its subclasses UpstreamError / MissingApiKeyError) already
 *   know their own safe message, error code, and HTTP status — we just
 *   serialize them via `.toJSON()`.
 * - Anything else (a genuine bug) is logged with its stack trace but never
 *   leaked to the client; the client gets a generic 500.
 *
 * Must be registered LAST, after all routes, per Express convention
 * (four-arg signature is what makes Express treat this as an error handler).
 */

const { AppError } = require("../utils/errors");

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      console.error(`[${err.code}] ${err.message}`, err.cause || "");
    }
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Unexpected, non-AppError failure — log full detail server-side,
  // return a generic message to the client.
  console.error("[UNHANDLED_ERROR]", err);
  return res.status(500).json({
    error: true,
    message: "Something went wrong on our end. Please try again.",
    code: "INTERNAL_ERROR",
  });
}

/** 404 handler for unmatched routes — kept separate from errorHandler since it's not an error path. */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: true,
    message: `No route matches ${req.method} ${req.originalUrl}.`,
    code: "NOT_FOUND",
  });
}

module.exports = { errorHandler, notFoundHandler };
