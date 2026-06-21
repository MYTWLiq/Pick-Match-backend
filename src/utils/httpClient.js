/**
 * @fileoverview A single hardened HTTP client used by every content service
 * to call upstream third-party APIs. Centralizing this means timeout,
 * retry-on-429, and error-wrapping behavior is consistent and only needs
 * to be correct in one place.
 */

const { UpstreamError } = require("./errors");

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRIES_ON_RATE_LIMIT = 2;
const RETRY_BASE_DELAY_MS = 600;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches JSON from a URL with a timeout, automatic retry with backoff
 * on HTTP 429, and a normalized AppError (UpstreamError) on any failure.
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {string} serviceName - Used in error messages, e.g. "TVmaze".
 * @param {RequestInit} [options.fetchOptions] - Passed through to fetch().
 * @param {number} [options.timeoutMs]
 * @returns {Promise<any>} Parsed JSON body.
 */
async function fetchJson(url, serviceName, options = {}) {
  const { fetchOptions = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES_ON_RATE_LIMIT; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get("retry-after");
        const delay = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : RETRY_BASE_DELAY_MS * Math.pow(2, attempt);

        if (attempt < MAX_RETRIES_ON_RATE_LIMIT) {
          await sleep(delay);
          continue;
        }
        throw new UpstreamError(serviceName, { status: 429 });
      }

      if (!res.ok) {
        throw new UpstreamError(serviceName, { status: res.status, statusText: res.statusText });
      }

      return await res.json();
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;

      if (err.name === "AbortError") {
        lastError = new UpstreamError(serviceName, { status: 504, statusText: "timeout" });
        break; // don't retry timeouts indefinitely
      }
      if (err instanceof UpstreamError && err.statusCode !== 429) {
        break; // non-rate-limit upstream errors are not retried
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new UpstreamError(serviceName, lastError);
}

module.exports = { fetchJson };
