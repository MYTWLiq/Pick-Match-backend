/**
 * @fileoverview The Recommendation Engine.
 *
 * This is the single orchestrator implementing steps 3-7 of the product
 * flow described in the project brief:
 *   3. Answers are converted into filters/preferences   (the caller does this; we receive `profile`)
 *   4. Relevant API is queried                          (service.buildCandidatePool)
 *   5. Results are ranked by relevance                  (service.score + normalizeScores)
 *   6. Return up to 10 recommendations                  (slice after ranking)
 *   7. Each includes title/image/match%/genres/year/summary (finalize)
 *
 * Every content service plugs into this engine via the same five-method
 * contract (buildCandidatePool, normalize, score, questions, type) —
 * the engine itself contains zero content-type-specific logic.
 */

const { getService, listContentTypes } = require("./contentTypeRegistry");
const aiSummaryService = require("../services/ai/aiSummaryService");
const { AppError, ErrorCodes } = require("../utils/errors");

const MAX_RECOMMENDATIONS = 10;
const MIN_DISPLAY_SCORE = 38; // floor so even a "weak" match doesn't show as e.g. 4%
const MAX_DISPLAY_SCORE = 99; // ceiling so nothing claims a suspicious "perfect" 100%

/**
 * Clamps a raw score into the displayed 0-100 match percentage range.
 * @param {number} rawScore
 * @returns {number}
 */
function toMatchPercentage(rawScore) {
  return Math.max(MIN_DISPLAY_SCORE, Math.min(MAX_DISPLAY_SCORE, Math.round(rawScore)));
}

/**
 * De-duplicates raw normalized items by title (case-insensitive), since
 * candidate pools built from multiple search terms can overlap.
 * @param {import("../types").RawResultItem[]} items
 * @returns {import("../types").RawResultItem[]}
 */
function dedupeByTitle(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item) return false;
    const key = item.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Runs the full recommendation flow for one content type + profile.
 * @param {import("../types").ContentType} type
 * @param {import("../types").UserProfile} profile
 * @param {{ includeAiSummaries?: boolean }} [options]
 * @returns {Promise<{ type: string, results: import("../types").Recommendation[], coverageNote?: string, aiProvider: string }>}
 */
async function getRecommendations(type, profile, options = {}) {
  const { includeAiSummaries = true } = options;
  const service = getService(type);

  // Step 4: query the relevant API for a pool of candidates.
  const rawCandidates = await service.buildCandidatePool(profile || {});

  if (!rawCandidates || rawCandidates.length === 0) {
    throw new AppError(
      "No results were found for these preferences. Try different answers.",
      ErrorCodes.NO_RESULTS,
      404
    );
  }

  // Normalize every candidate into the shared RawResultItem shape.
  const normalized = dedupeByTitle(
    rawCandidates.map((raw) => service.normalize(raw)).filter(Boolean)
  );

  if (normalized.length === 0) {
    throw new AppError(
      "No usable results were found for these preferences. Try different answers.",
      ErrorCodes.NO_RESULTS,
      404
    );
  }

  // Step 5: score and rank.
  const scored = normalized
    .map((item) => ({ ...item, score: service.score(item, profile || {}) }))
    .sort((a, b) => b.score - a.score);

  // Step 6: take the top N.
  const top = scored.slice(0, MAX_RECOMMENDATIONS);

  // Step 7: finalize each into the client-facing Recommendation shape,
  // attaching an AI-generated short summary.
  const summaries = includeAiSummaries
    ? await aiSummaryService.summarizeBatch(top, profile || {})
    : top.map((item) => item.summary);

  const results = top.map((item, index) => finalize(item, summaries[index]));

  return {
    type,
    results,
    coverageNote: service.coverageNote,
    aiProvider: includeAiSummaries ? aiSummaryService.getActiveProviderName() : "none",
  };
}

/**
 * Converts a scored RawResultItem into the final client-facing shape.
 * @param {import("../types").ScoredResultItem} item
 * @param {string} summary
 * @returns {import("../types").Recommendation}
 */
function finalize(item, summary) {
  return {
    id: item.id,
    title: item.title,
    image: item.image,
    matchPercentage: toMatchPercentage(item.score),
    genres: item.genres,
    year: item.year,
    summary,
    extra: item.extra,
    link: item.link,
  };
}

/**
 * @returns {import("../types").Question[]} the question set for a content type
 */
function getQuestions(type) {
  return getService(type).questions;
}

module.exports = {
  getRecommendations,
  getQuestions,
  listContentTypes,
  toMatchPercentage,
};
