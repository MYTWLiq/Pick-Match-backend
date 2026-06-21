/**
 * @fileoverview TV Shows content service — TVmaze API.
 * Docs: https://www.tvmaze.com/api
 * No API key required. CORS-friendly, but we still proxy through the
 * backend for consistent caching, error handling, and response shape.
 */

const config = require("../../config");
const { fetchJson } = require("../../utils/httpClient");
const { getOrSet, buildKey } = require("../../cache/cacheService");
const { stripHtml, truncate, extractYear } = require("../../utils/textUtils");

const SERVICE_NAME = "TVmaze";
const BASE_URL = config.apis.tvmaze.baseUrl;

/** Questions asked for the "tv" content type. Mirrors the original frontend's question set. */
const QUESTIONS = [
  { key: "genre", text: "What genre are you in the mood for?", options: ["Drama", "Comedy", "Crime", "Science-Fiction", "Fantasy", "Reality", "Anime", "Documentary", "Horror", "Romance"] },
  { key: "era", text: "Recent, or something older?", options: ["Brand new (last 2 years)", "2010s", "2000s", "90s or earlier", "Doesn't matter"] },
  { key: "length", text: "How big a commitment do you want?", options: ["One short season", "Multiple seasons, ongoing", "A finite limited series", "Doesn't matter"] },
  { key: "tone", text: "Serious and weighty, or lighthearted?", options: ["Serious / heavy", "Lighthearted / fun", "Dark comedy", "A mix of both"] },
  { key: "popularity", text: "Mainstream hit, or underrated gem?", options: ["Popular / well-known", "Underrated / hidden gem", "Either is fine"] },
  { key: "pace", text: "Fast-paced and twisty, or slow burn?", options: ["Fast-paced", "Slow burn, character-driven", "Either works"] },
  { key: "language", text: "Any language preference?", options: ["English", "Korean", "Japanese", "Spanish", "Any language (with subtitles)"] },
  { key: "setting", text: "Any setting you're drawn to?", options: ["Modern day", "Historical", "Futuristic / sci-fi world", "Fantasy world", "No preference"] },
  { key: "popularity2", text: "How big should the fan base be?", options: ["Massive cult following", "Small but devoted", "Doesn't matter"] },
  { key: "avoid", text: "Anything you'd like to avoid?", options: ["Excessive violence", "Sad / tragic endings", "Slow pacing", "Nothing — I'm open"] },
];

/**
 * Searches TVmaze shows by free-text query.
 * @param {string} query
 * @returns {Promise<any[]>} Raw TVmaze show objects.
 */
async function searchShows(query) {
  const cacheKey = buildKey("tvmaze:search", { query });
  return getOrSet(cacheKey, async () => {
    const url = `${BASE_URL}/search/shows?q=${encodeURIComponent(query)}`;
    const data = await fetchJson(url, SERVICE_NAME);
    return (data || []).map((entry) => entry.show).filter(Boolean);
  });
}

/**
 * Fetches full details for a single show by TVmaze id, including cast
 * and genres (TVmaze's show-search endpoint already includes most of
 * this, but the dedicated details endpoint is used when an id is known
 * and richer data — e.g. embedded cast — is wanted).
 * @param {number|string} showId
 */
async function getShowDetails(showId) {
  const cacheKey = buildKey("tvmaze:show", { showId });
  return getOrSet(cacheKey, async () => {
    const url = `${BASE_URL}/shows/${showId}?embed=cast`;
    return fetchJson(url, SERVICE_NAME);
  });
}

/**
 * Builds a wide candidate pool for a profile by searching the genre term
 * plus a couple of broadening terms, then de-duplicating. TVmaze has no
 * "browse by filter" endpoint, so search-term breadth substitutes for
 * structured filtering.
 * @param {import("../../types").UserProfile} profile
 * @returns {Promise<any[]>} de-duplicated raw show objects
 */
async function buildCandidatePool(profile) {
  const primaryTerm = profile.genre || "drama";
  const searches = [primaryTerm, "popular", "the"];

  const pools = await Promise.all(
    searches.map((term) => searchShows(term).catch(() => []))
  );

  const seen = new Set();
  const merged = [];
  for (const show of pools.flat()) {
    if (!show || seen.has(show.id)) continue;
    seen.add(show.id);
    merged.push(show);
  }
  return merged;
}

/**
 * Normalizes a raw TVmaze show into the shared RawResultItem shape.
 * @param {any} show
 * @returns {import("../../types").RawResultItem}
 */
function normalize(show) {
  const year = extractYear(show.premiered);
  return {
    id: String(show.id),
    title: show.name,
    image: show.image ? show.image.original || show.image.medium : null,
    year: year ?? "—",
    genres: (show.genres || []).slice(0, 3),
    summary: truncate(stripHtml(show.summary), 240) || "No summary available.",
    type: "tv",
    link: show.url,
    extra: {
      network: show.network?.name || show.webChannel?.name || undefined,
      status: show.status || undefined,
      language: show.language || undefined,
      runtime: show.runtime ? `${show.runtime} min/ep` : undefined,
    },
    raw: {
      rating: show.rating?.average ?? null,
      premiered: show.premiered,
      year,
      genres: (show.genres || []).map((g) => g.toLowerCase()),
    },
  };
}

/**
 * Scores a normalized TV result against the user's profile. Returns a
 * 0-100ish raw score (the recommendation engine clamps/finalizes it).
 * @param {import("../../types").RawResultItem} item
 * @param {import("../../types").UserProfile} profile
 * @returns {number}
 */
function score(item, profile) {
  let s = 55;
  const genres = item.raw.genres || [];

  if (profile.genre && genres.some((g) => g.includes(profile.genre.toLowerCase()))) s += 18;
  if (profile.tone === "Lighthearted / fun" && genres.includes("comedy")) s += 10;
  if (profile.tone === "Serious / heavy" && (genres.includes("drama") || genres.includes("crime"))) s += 10;
  if (profile.tone === "Dark comedy" && genres.includes("comedy") && genres.includes("drama")) s += 8;

  const rating = item.raw.rating;
  if (rating) {
    s += Math.min(12, (rating - 6) * 3);
    if (profile.popularity === "Popular / well-known" && rating >= 7.5) s += 8;
    if (profile.popularity === "Underrated / hidden gem" && rating < 7.5) s += 6;
  }

  const year = item.raw.year;
  if (year) {
    if (profile.era === "Brand new (last 2 years)" && year >= 2024) s += 12;
    if (profile.era === "2010s" && year >= 2010 && year < 2020) s += 10;
    if (profile.era === "2000s" && year >= 2000 && year < 2010) s += 10;
    if (profile.era === "90s or earlier" && year < 1999) s += 10;
  }

  if (profile.language === "English" && item.extra.language === "English") s += 6;

  // small deterministic jitter (based on id) instead of Math.random(),
  // so repeated requests with the same profile return stable rankings.
  const jitter = (parseInt(item.id, 10) % 7) * 0.6;
  s += jitter;

  return s;
}

module.exports = {
  type: "tv",
  questions: QUESTIONS,
  searchShows,
  getShowDetails,
  buildCandidatePool,
  normalize,
  score,
};
