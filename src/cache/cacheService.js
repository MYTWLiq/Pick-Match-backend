/**
 * @fileoverview In-memory cache for upstream API responses.
 *
 * Why cache: every upstream API here (TVmaze, Jikan, FreeToGame, Google
 * Books, TMDB, YouTube) has rate limits, and identical questionnaire
 * answers from different users (or repeated "try again" clicks from the
 * same user) frequently produce the exact same upstream query. Caching
 * those responses for a short window dramatically cuts request volume
 * without staling out recommendations (content metadata rarely changes
 * minute to minute).
 *
 * Uses `node-cache` (declared in package.json) — a simple, dependency-free
 * in-memory TTL cache. For multi-instance/production deployments, swap
 * this module's internals for Redis without touching any call sites,
 * since everything goes through getOrSet().
 */

const NodeCache = require("node-cache");
const config = require("../config");

const cache = new NodeCache({
  stdTTL: config.cache.ttlSeconds,
  checkperiod: Math.max(60, Math.floor(config.cache.ttlSeconds / 4)),
  useClones: false,
});

/**
 * Builds a stable cache key from a namespace and a params object.
 * @param {string} namespace - e.g. "tvmaze:search"
 * @param {Object} params - query parameters; order-independent.
 * @returns {string}
 */
function buildKey(namespace, params = {}) {
  const sortedEntries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  const paramsStr = sortedEntries.map(([k, v]) => `${k}=${v}`).join("&");
  return `${namespace}?${paramsStr}`;
}

/**
 * Returns a cached value if present, otherwise calls `fetchFn`, caches
 * the result, and returns it. Failures from fetchFn are NOT cached.
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fetchFn
 * @param {number} [ttlSeconds] - Override the default TTL for this key.
 * @returns {Promise<T>}
 */
async function getOrSet(key, fetchFn, ttlSeconds) {
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const fresh = await fetchFn();
  cache.set(key, fresh, ttlSeconds ?? config.cache.ttlSeconds);
  return fresh;
}

function invalidate(key) {
  cache.del(key);
}

function flushAll() {
  cache.flushAll();
}

function stats() {
  return cache.getStats();
}

module.exports = { getOrSet, buildKey, invalidate, flushAll, stats };
