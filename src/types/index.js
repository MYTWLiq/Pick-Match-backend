/**
 * @fileoverview Shared type definitions for Pick Match.
 *
 * This project is plain JavaScript (not TypeScript), so these are
 * documented as JSDoc typedefs. They give editor autocomplete/type-checking
 * (via `// @ts-check` if enabled) without requiring a TypeScript build step,
 * and serve as the single source of truth for the shape of data flowing
 * between services, the recommendation engine, and the API routes.
 */

/**
 * The six supported content categories. Adding a new category means:
 *   1. Add the key here and to CONTENT_TYPES below.
 *   2. Create a service file in src/services/content/.
 *   3. Register it in src/engine/contentTypeRegistry.js.
 * @typedef {"tv"|"anime"|"game"|"book"|"movie"|"youtube"} ContentType
 */

/**
 * @typedef {Object} QuestionOption
 * @property {string} label - Human-readable option shown to the user.
 * @property {string} value - Normalized value stored in the user's profile.
 */

/**
 * @typedef {Object} Question
 * @property {string} key - Profile field this question populates (e.g. "genre").
 * @property {string} text - The question shown to the user.
 * @property {QuestionOption[]} [options] - Choices, for non-free-text questions.
 * @property {boolean} [freeText] - If true, the question accepts typed input.
 * @property {string} [placeholder] - Placeholder for free-text questions.
 */

/**
 * A user's collected answers for one recommendation session.
 * Keys are arbitrary per-category (see each service's QUESTIONS array)
 * but commonly include: genre, era, length, tone, popularity, language,
 * country, avoid.
 * @typedef {Object.<string, string>} UserProfile
 */

/**
 * Normalized shape every content service must return, regardless of
 * which upstream API it called. This is what the recommendation engine
 * ranks and what the API ultimately returns to the client.
 * @typedef {Object} RawResultItem
 * @property {string} id - Stable unique id (string form of upstream id).
 * @property {string} title
 * @property {string|null} image - Absolute URL to poster/cover/thumbnail, or null.
 * @property {string|number} year - Release/premiere year, or "—" if unknown.
 * @property {string[]} genres - Up to ~3 genre/category labels.
 * @property {string} summary - Plain-text synopsis/description (HTML stripped).
 * @property {Object.<string, string|number>} [extra] - Category-specific facts
 *   (e.g. { episodes: 24, studio: "Madhouse" } for anime).
 * @property {ContentType} type
 * @property {string} [link] - External URL to view/learn more, if available.
 * @property {Object} [raw] - Original upstream API fields useful for scoring
 *   (e.g. rating, popularity count). Not returned to the client.
 */

/**
 * A RawResultItem after scoring, with a match percentage attached.
 * @typedef {RawResultItem & { score: number }} ScoredResultItem
 */

/**
 * Final shape returned to the client for each recommendation.
 * @typedef {Object} Recommendation
 * @property {string} id
 * @property {string} title
 * @property {string|null} image
 * @property {number} matchPercentage - 0-100.
 * @property {string[]} genres
 * @property {string|number} year
 * @property {string} summary - AI-generated (or fallback) short summary.
 * @property {Object.<string, string|number>} [extra]
 * @property {string} [link]
 */

/**
 * Standard error shape returned by the API on failure.
 * @typedef {Object} ApiErrorResponse
 * @property {true} error
 * @property {string} message - Human-readable, safe to show to end users.
 * @property {string} code - Machine-readable error code (see errorCodes.js).
 * @property {number} [retryAfterMs] - Present for rate-limit/backoff errors.
 */

/**
 * Interface every AI summary provider must implement.
 * @typedef {Object} AiSummaryProvider
 * @property {string} name
 * @property {(item: RawResultItem, profile: UserProfile) => Promise<string>} summarize
 */

/** Canonical list of supported content types, with display metadata. */
const CONTENT_TYPES = Object.freeze({
  tv: { label: "TV Show", emoji: "📺" },
  anime: { label: "Anime", emoji: "🌀" },
  game: { label: "Video Game", emoji: "🎮" },
  book: { label: "Book", emoji: "📚" },
  movie: { label: "Movie", emoji: "🎬" },
  youtube: { label: "YouTube Video", emoji: "▶️" },
});

module.exports = { CONTENT_TYPES };
