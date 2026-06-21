/**
 * @fileoverview Centralized error handling primitives.
 * Every service throws AppError (or a subclass) instead of raw Error,
 * so the error-handling middleware can produce consistent, safe responses.
 */

const ErrorCodes = Object.freeze({
  INVALID_REQUEST: "INVALID_REQUEST",
  MISSING_API_KEY: "MISSING_API_KEY",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  UPSTREAM_RATE_LIMITED: "UPSTREAM_RATE_LIMITED",
  UPSTREAM_TIMEOUT: "UPSTREAM_TIMEOUT",
  NO_RESULTS: "NO_RESULTS",
  UNKNOWN_CONTENT_TYPE: "UNKNOWN_CONTENT_TYPE",
  AI_PROVIDER_ERROR: "AI_PROVIDER_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
});

class AppError extends Error {
  /**
   * @param {string} message - Safe, human-readable message.
   * @param {string} code - One of ErrorCodes.
   * @param {number} [statusCode=500] - HTTP status code to respond with.
   * @param {Object} [options]
   * @param {number} [options.retryAfterMs] - For rate-limit errors.
   * @param {Error} [options.cause] - Original error, for logging only.
   */
  constructor(message, code = ErrorCodes.INTERNAL_ERROR, statusCode = 500, options = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryAfterMs = options.retryAfterMs;
    this.cause = options.cause;
  }

  toJSON() {
    const body = { error: true, message: this.message, code: this.code };
    if (this.retryAfterMs) body.retryAfterMs = this.retryAfterMs;
    return body;
  }
}

class UpstreamError extends AppError {
  constructor(serviceName, originalError) {
    const isRateLimit = originalError?.status === 429 || originalError?.statusCode === 429;
    super(
      isRateLimit
        ? `${serviceName} is rate-limiting our requests right now. Please try again shortly.`
        : `${serviceName} could not be reached right now.`,
      isRateLimit ? ErrorCodes.UPSTREAM_RATE_LIMITED : ErrorCodes.UPSTREAM_ERROR,
      isRateLimit ? 429 : 502,
      { cause: originalError, retryAfterMs: isRateLimit ? 5000 : undefined }
    );
  }
}

class MissingApiKeyError extends AppError {
  constructor(envVarName, serviceName) {
    super(
      `${serviceName} is not configured on this server (missing ${envVarName}). ` +
        `Add a value to ${envVarName} in your .env file.`,
      ErrorCodes.MISSING_API_KEY,
      503
    );
  }
}

module.exports = { AppError, UpstreamError, MissingApiKeyError, ErrorCodes };
