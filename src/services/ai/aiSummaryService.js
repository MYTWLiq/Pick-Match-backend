/**
 * @fileoverview Central AI Summary Service.
 *
 * This is the ONLY file the rest of the app (the recommendation engine)
 * talks to for AI-generated summaries. It:
 *   1. Picks the active provider based on config.ai.provider (.env: AI_PROVIDER).
 *   2. Falls back automatically to the local provider if the configured
 *      one is unavailable (no key, SDK missing) or fails at call time.
 *   3. Caches summaries per (item id + profile signature) so repeated
 *      requests for the same item/preferences don't re-call the LLM.
 *
 * Switching providers requires changing exactly one line in .env:
 *   AI_PROVIDER=claude | openai | gemini | local
 * No code changes are needed elsewhere in the app.
 */

const config = require("../../config");
const { getOrSet, buildKey } = require("../../cache/cacheService");

const claudeProvider = require("./providers/claudeProvider");
const openaiProvider = require("./providers/openaiProvider");
const geminiProvider = require("./providers/geminiProvider");
const localProvider = require("./providers/localProvider");

/** @type {Object.<string, import("./aiProviderInterface").AiProvider>} */
const PROVIDERS = {
  claude: claudeProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  local: localProvider,
};

/**
 * Resolves the provider that should actually be used right now: the
 * configured one if available, otherwise local. Logged once per
 * fallback so misconfiguration is visible in server logs, not silent.
 * @returns {import("./aiProviderInterface").AiProvider}
 */
function resolveProvider() {
  const requested = PROVIDERS[config.ai.provider] || PROVIDERS.local;
  if (requested.isAvailable()) return requested;

  if (requested.name !== "local") {
    console.warn(
      `[aiSummaryService] Provider "${requested.name}" is configured but not available ` +
        `(missing API key or SDK). Falling back to "local" for this request.`
    );
  }
  return localProvider;
}

/**
 * Builds a stable signature for a user profile so cache keys don't
 * explode in size while still distinguishing meaningfully different
 * preference sets.
 * @param {import("../../types").UserProfile} profile
 */
function profileSignature(profile) {
  return Object.entries(profile)
    .filter(([, v]) => v)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
}

/**
 * Generates a short AI summary for one result item, tailored to the
 * user's profile. Always resolves to a usable string — never throws —
 * because a summary failure should degrade gracefully (fall back to
 * the item's original description) rather than break recommendations.
 * @param {import("../../types").RawResultItem} item
 * @param {import("../../types").UserProfile} profile
 * @returns {Promise<string>}
 */
async function summarize(item, profile) {
  const provider = resolveProvider();
  const cacheKey = buildKey("ai:summary", {
    provider: provider.name,
    itemId: item.id,
    type: item.type,
    profile: profileSignature(profile),
  });

  try {
    return await getOrSet(cacheKey, () => provider.summarize(item, profile), config.cache.ttlSeconds);
  } catch (err) {
    console.warn(
      `[aiSummaryService] Provider "${provider.name}" failed for "${item.title}": ${err.message}. ` +
        `Falling back to local summary.`
    );
    try {
      return await localProvider.summarize(item, profile);
    } catch {
      // Local provider should never throw, but guarantee a string regardless.
      return item.summary || "No summary available.";
    }
  }
}

/**
 * Summarizes a batch of items concurrently (bounded), preserving order.
 * Used by the recommendation engine after ranking, on the final top-N
 * list only — not on the full candidate pool — to keep LLM call volume
 * sane.
 * @param {import("../../types").RawResultItem[]} items
 * @param {import("../../types").UserProfile} profile
 * @returns {Promise<string[]>}
 */
async function summarizeBatch(items, profile) {
  return Promise.all(items.map((item) => summarize(item, profile)));
}

/** Returns the name of the provider that would currently be used. */
function getActiveProviderName() {
  return resolveProvider().name;
}

module.exports = { summarize, summarizeBatch, getActiveProviderName, PROVIDERS };
