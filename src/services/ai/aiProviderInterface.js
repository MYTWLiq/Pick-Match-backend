/**
 * @fileoverview Defines the contract every AI summary provider must follow.
 * This is the abstraction layer that lets the rest of the app call
 * `aiSummaryService.summarize(...)` without knowing or caring whether
 * the active provider is Claude, OpenAI, Gemini, or the local fallback.
 *
 * To add a new provider:
 *   1. Create src/services/ai/providers/yourProvider.js
 *   2. Export an object matching this shape: { name, isAvailable, summarize }
 *   3. Register it in src/services/ai/aiSummaryService.js's PROVIDERS map.
 *   4. Add AI_PROVIDER=yourprovider as a valid value in .env.example.
 */

/**
 * @typedef {Object} AiProvider
 * @property {string} name - Human-readable provider name, used in logs.
 * @property {() => boolean} isAvailable - Whether this provider is usable
 *   right now (API key present, SDK installed, etc). Checked before every
 *   call so we can fall back gracefully instead of throwing mid-request.
 * @property {(item: import("../../types").RawResultItem, profile: import("../../types").UserProfile) => Promise<string>} summarize -
 *   Returns a short (1-3 sentence) plain-text summary tailored to why
 *   this item matches the user's stated preferences.
 */

/**
 * Builds the standard prompt text used by every LLM-backed provider, so
 * Claude/OpenAI/Gemini all receive the same instructions and produce
 * comparably-shaped output.
 * @param {import("../../types").RawResultItem} item
 * @param {import("../../types").UserProfile} profile
 * @returns {string}
 */
function buildSummaryPrompt(item, profile) {
  const profileLines = Object.entries(profile)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  return `You are writing a short, enthusiastic recommendation blurb for a content discovery app.

Title: ${item.title}
Type: ${item.type}
Year: ${item.year}
Genres: ${(item.genres || []).join(", ") || "unknown"}
Original description: ${item.summary || "No description available."}

The user is looking for content with these preferences:
${profileLines || "(no strong preferences stated)"}

Write a 1-3 sentence summary that:
- Stays factually consistent with the original description (don't invent plot details).
- Briefly connects why this might match what the user asked for, where genuinely relevant.
- Reads naturally, not like a form letter. No preamble, no "Sure, here's...".
- Is plain text only, no markdown formatting.`;
}

module.exports = { buildSummaryPrompt };
