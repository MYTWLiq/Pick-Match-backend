/**
 * @fileoverview Movies content service — TMDB (The Movie Database) API.
 * Docs: https://developer.themoviedb.org/reference/intro/getting-started
 * REQUIRES a secret API key (TMDB_API_KEY) — this is why this service
 * must run server-side, never in browser JS. The key is read once from
 * config and attached to every request here; it never leaves this file.
 */

const config = require("../../config");
const { fetchJson } = require("../../utils/httpClient");
const { getOrSet, buildKey } = require("../../cache/cacheService");
const { truncate, extractYear } = require("../../utils/textUtils");
const { MissingApiKeyError } = require("../../utils/errors");

const SERVICE_NAME = "TMDB";
const BASE_URL = config.apis.tmdb.baseUrl;
const IMAGE_BASE_URL = config.apis.tmdb.imageBaseUrl;
const BACKDROP_BASE_URL = "https://image.tmdb.org/t/p/w780";

const QUESTIONS = [
  { key: "genre", text: "What genre are you in the mood for?", options: ["Action", "Comedy", "Drama", "Horror", "Romance", "Science Fiction", "Thriller", "Animation", "Documentary", "Fantasy"] },
  { key: "era", text: "Recent, or something older?", options: ["Brand new (last 2 years)", "2010s", "2000s", "90s or earlier", "Doesn't matter"] },
  { key: "length", text: "Any runtime preference?", options: ["Short (under 100 min)", "Standard (100-150 min)", "Epic (150+ min)", "Doesn't matter"] },
  { key: "tone", text: "Serious and weighty, or lighthearted?", options: ["Serious / heavy", "Lighthearted / fun", "Dark comedy", "A mix of both"] },
  { key: "popularity", text: "Blockbuster hit, or underrated gem?", options: ["Popular / well-known", "Underrated / hidden gem", "Either is fine"] },
  { key: "pace", text: "Fast-paced, or slow burn?", options: ["Fast-paced", "Slow burn, character-driven", "Either works"] },
  { key: "language", text: "Any language preference?", options: ["English", "Korean", "Japanese", "Spanish", "Any language (with subtitles)"] },
  { key: "setting", text: "Any setting you're drawn to?", options: ["Modern day", "Historical", "Futuristic / sci-fi world", "Fantasy world", "No preference"] },
  { key: "ageRating", text: "Any content rating preference?", options: ["Family-friendly", "Mature / R-rated is fine", "No preference"] },
  { key: "avoid", text: "Anything you'd like to avoid?", options: ["Excessive violence", "Sad / tragic endings", "Slow pacing", "Nothing — I'm open"] },
];

function assertConfigured() {
  if (!config.apis.tmdb.apiKey || config.apis.tmdb.apiKey.startsWith("your_")) {
    throw new MissingApiKeyError("TMDB_API_KEY", "Movies (TMDB)");
  }
}

/** TMDB genre id -> name map (fetched once and cached; falls back to a static map if the call fails). */
const STATIC_GENRE_MAP = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
  878: "Science Fiction", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
};
const NAME_TO_GENRE_ID = Object.fromEntries(
  Object.entries(STATIC_GENRE_MAP).map(([id, name]) => [name.toLowerCase(), Number(id)])
);

/**
 * Searches movies by free-text query.
 * @param {string} query
 * @returns {Promise<any[]>} raw TMDB movie objects
 */
async function searchMovies(query) {
  assertConfigured();
  const cacheKey = buildKey("tmdb:search", { query });
  return getOrSet(cacheKey, async () => {
    const url = `${BASE_URL}/search/movie?query=${encodeURIComponent(query)}&include_adult=false`;
    const data = await fetchJson(url, SERVICE_NAME, {
      fetchOptions: { headers: { Authorization: `Bearer ${config.apis.tmdb.apiKey}` } },
    });
    return data?.results || [];
  });
}

/**
 * Discovers movies by genre id with sort/filter options — used to build
 * a richer, more relevant candidate pool than free-text search alone.
 * @param {{ genreId?: number, sortBy?: string, yearGte?: number, yearLte?: number }} filters
 */
async function discoverMovies(filters = {}) {
  assertConfigured();
  const cacheKey = buildKey("tmdb:discover", filters);
  return getOrSet(cacheKey, async () => {
    const params = new URLSearchParams({
      include_adult: "false",
      sort_by: filters.sortBy || "popularity.desc",
    });
    if (filters.genreId) params.set("with_genres", String(filters.genreId));
    if (filters.yearGte) params.set("primary_release_date.gte", `${filters.yearGte}-01-01`);
    if (filters.yearLte) params.set("primary_release_date.lte", `${filters.yearLte}-12-31`);

    const url = `${BASE_URL}/discover/movie?${params.toString()}`;
    const data = await fetchJson(url, SERVICE_NAME, {
      fetchOptions: { headers: { Authorization: `Bearer ${config.apis.tmdb.apiKey}` } },
    });
    return data?.results || [];
  });
}

/**
 * Fetches full details for a single movie, including cast (via append_to_response).
 * @param {number|string} movieId
 */
async function getMovieDetails(movieId) {
  assertConfigured();
  const cacheKey = buildKey("tmdb:movie", { movieId });
  return getOrSet(cacheKey, async () => {
    const url = `${BASE_URL}/movie/${movieId}?append_to_response=credits`;
    return fetchJson(url, SERVICE_NAME, {
      fetchOptions: { headers: { Authorization: `Bearer ${config.apis.tmdb.apiKey}` } },
    });
  });
}

/**
 * @param {import("../../types").UserProfile} profile
 * @returns {Promise<any[]>}
 */
async function buildCandidatePool(profile) {
  const genreId = profile.genre ? NAME_TO_GENRE_ID[profile.genre.toLowerCase()] : undefined;

  const eraRanges = {
    "Brand new (last 2 years)": { yearGte: 2024 },
    "2010s": { yearGte: 2010, yearLte: 2019 },
    "2000s": { yearGte: 2000, yearLte: 2009 },
    "90s or earlier": { yearLte: 1999 },
  };
  const eraFilter = eraRanges[profile.era] || {};

  const sortBy = profile.popularity === "Underrated / hidden gem" ? "vote_average.desc" : "popularity.desc";

  const [discovered, searched] = await Promise.all([
    discoverMovies({ genreId, sortBy, ...eraFilter }).catch(() => []),
    searchMovies(profile.genre || "popular").catch(() => []),
  ]);

  const seen = new Set();
  const merged = [];
  for (const m of [...discovered, ...searched]) {
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    merged.push(m);
  }
  return merged;
}

/**
 * Fetches top cast names for a movie. Best-effort: returns [] on failure
 * rather than breaking the whole recommendation if credits fail to load.
 * @param {number} movieId
 * @returns {Promise<string[]>}
 */
async function getTopCast(movieId, limit = 4) {
  try {
    const details = await getMovieDetails(movieId);
    return (details.credits?.cast || []).slice(0, limit).map((c) => c.name);
  } catch {
    return [];
  }
}

/**
 * @param {any} movie - raw TMDB movie object (from search or discover)
 * @returns {import("../../types").RawResultItem}
 */
function normalize(movie) {
  const year = extractYear(movie.release_date);
  const genreNames = (movie.genre_ids || [])
    .map((id) => STATIC_GENRE_MAP[id])
    .filter(Boolean)
    .slice(0, 3);

  return {
    id: String(movie.id),
    title: movie.title,
    image: movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : null,
    year: year ?? "—",
    genres: genreNames,
    summary: truncate(movie.overview, 240) || "No overview available.",
    type: "movie",
    link: `https://www.themoviedb.org/movie/${movie.id}`,
    extra: {
      rating: movie.vote_average ? `${movie.vote_average.toFixed(1)}/10` : undefined,
      backdrop: movie.backdrop_path ? `${BACKDROP_BASE_URL}${movie.backdrop_path}` : undefined,
    },
    raw: {
      genreIds: movie.genre_ids || [],
      voteAverage: movie.vote_average,
      voteCount: movie.vote_count,
      popularity: movie.popularity,
      year,
      tmdbId: movie.id,
    },
  };
}

/**
 * @param {import("../../types").RawResultItem} item
 * @param {import("../../types").UserProfile} profile
 * @returns {number}
 */
function score(item, profile) {
  let s = 55;
  const genreId = profile.genre ? NAME_TO_GENRE_ID[profile.genre.toLowerCase()] : undefined;

  if (genreId && item.raw.genreIds.includes(genreId)) s += 18;

  if (item.raw.voteAverage) {
    s += Math.min(12, (item.raw.voteAverage - 6) * 3);
    if (profile.popularity === "Popular / well-known" && item.raw.voteCount > 1000) s += 8;
    if (profile.popularity === "Underrated / hidden gem" && item.raw.voteCount < 1000 && item.raw.voteAverage >= 7) s += 10;
  }

  const year = item.raw.year;
  if (year) {
    if (profile.era === "Brand new (last 2 years)" && year >= 2024) s += 12;
    if (profile.era === "2010s" && year >= 2010 && year < 2020) s += 10;
    if (profile.era === "2000s" && year >= 2000 && year < 2010) s += 10;
    if (profile.era === "90s or earlier" && year < 1999) s += 10;
  }

  const jitter = (item.raw.tmdbId % 7) * 0.5;
  s += jitter;

  return s;
}

module.exports = {
  type: "movie",
  questions: QUESTIONS,
  searchMovies,
  discoverMovies,
  getMovieDetails,
  getTopCast,
  buildCandidatePool,
  normalize,
  score,
  isConfigured: () => {
    try {
      assertConfigured();
      return true;
    } catch {
      return false;
    }
  },
};
