/**
 * @fileoverview Local, rule-based summary provider.
 * Needs no API key, no network call, and no SDK — it composes a short
 * summary from the item's existing data plus the user's top stated
 * preference. This is the default safety net: if the configured LLM
 * provider has no key, fails, times out, or is rate-limited, the
 * recommendation engine falls back to this so the user always gets a
 * usable summary instead of an error.
 */

const { truncate } = require("../../../utils/textUtils");

function pickHighlightPreference(profile) {
  // Prefer genre, then tone, then popularity, as the most "summary-worthy" signal.
  if (profile.genre) return { key: "genre", value: profile.genre };
  if (profile.tone) return { key: "tone", value: profile.tone };
  if (profile.popularity) return { key: "popularity", value: profile.popularity };
  const firstEntry = Object.entries(profile).find(([, v]) => v);
  return firstEntry ? { key: firstEntry[0], value: firstEntry[1] } : null;
}

const TYPE_NOUN = {
  tv: "show",
  anime: "anime",
  game: "game",
  book: "book",
  movie: "movie",
  youtube: "video",
};

/**
 * @param {import("../../../types").RawResultItem} item
 * @param {import("../../../types").UserProfile} profile
 * @returns {Promise<string>}
 */
async function summarize(item, profile) {
  const base = truncate(item.summary, 160) || `A ${TYPE_NOUN[item.type] || "title"} worth checking out.`;
  const highlight = pickHighlightPreference(profile);
  const genreText = item.genres && item.genres.length ? item.genres.slice(0, 2).join(" & ") : null;

  let connector = "";
  if (highlight && genreText) {
    connector = ` A solid pick if you're after ${highlight.value.toLowerCase()} ${TYPE_NOUN[item.type] || "content"} in the ${genreText} space.`;
  } else if (genreText) {
    connector = ` Falls squarely into ${genreText}.`;
  }

  return `${base}${connector}`.trim();
}

module.exports = {
  name: "local",
  isAvailable: () => true,
  summarize,
};
