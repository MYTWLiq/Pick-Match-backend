/**
 * @fileoverview Books content service — Google Books API.
 * Docs: https://developers.google.com/books/docs/v1/using
 * Usable keyless for search (lower, shared quota); an API key is
 * supported but not required, so none is requested in .env.example.
 */

const config = require("../../config");
const { fetchJson } = require("../../utils/httpClient");
const { getOrSet, buildKey } = require("../../cache/cacheService");
const { stripHtml, truncate, extractYear } = require("../../utils/textUtils");

const SERVICE_NAME = "Google Books";
const BASE_URL = config.apis.googleBooks.baseUrl;

const QUESTIONS = [
  { key: "genre", text: "What genre are you in the mood for?", options: ["Fantasy", "Mystery", "Thriller", "Romance", "Science Fiction", "Horror", "Fiction", "History", "Biography", "Self-Help"] },
  { key: "era", text: "Recent release, or a classic?", options: ["New release (last 2 years)", "Modern classic", "Older classic", "Doesn't matter"] },
  { key: "length", text: "How long a book do you want?", options: ["Short (under 300 pages)", "Medium (300-500 pages)", "Long / epic (500+ pages)", "Doesn't matter"] },
  { key: "tone", text: "Serious and heavy, or lighthearted?", options: ["Serious / literary", "Lighthearted / fun", "Dark / intense", "A mix"] },
  { key: "popularity", text: "Bestseller, or underrated gem?", options: ["Popular bestseller", "Underrated / hidden gem", "Either is fine"] },
  { key: "pov", text: "Any POV preference?", options: ["First person", "Third person", "No preference"] },
  { key: "country", text: "Any origin you're drawn to?", options: ["American", "British", "Translated / international", "No preference"] },
  { key: "series", text: "Standalone, or open to a series?", options: ["Standalone only", "Happy to start a series", "Doesn't matter"] },
  { key: "format", text: "Fiction or non-fiction?", options: ["Fiction", "Non-fiction", "No preference"] },
  { key: "avoid", text: "Anything you'd like to avoid?", options: ["Graphic violence", "Sad endings", "Slow pacing", "Nothing — I'm open"] },
];

/**
 * Searches Google Books by subject/genre and free-text terms.
 * @param {string} query
 * @returns {Promise<any[]>} raw Google Books volume objects
 */
async function searchBooks(query) {
  const cacheKey = buildKey("googlebooks:search", { query });
  return getOrSet(cacheKey, async () => {
    const url = `${BASE_URL}/volumes?q=${encodeURIComponent(query)}&maxResults=40&orderBy=relevance`;
    const data = await fetchJson(url, SERVICE_NAME);
    return data?.items || [];
  });
}

/**
 * Fetches full details for a single book by Google Books volume id.
 * @param {string} volumeId
 */
async function getBookDetails(volumeId) {
  const cacheKey = buildKey("googlebooks:volume", { volumeId });
  return getOrSet(cacheKey, async () => {
    const url = `${BASE_URL}/volumes/${volumeId}`;
    return fetchJson(url, SERVICE_NAME);
  });
}

/**
 * @param {import("../../types").UserProfile} profile
 * @returns {Promise<any[]>}
 */
async function buildCandidatePool(profile) {
  const genre = profile.genre || "fiction";
  const query = `subject:${genre}`;
  let results = await searchBooks(query);

  if (!results || results.length === 0) {
    results = await searchBooks(genre); // fall back to plain free-text search
  }
  return results;
}

/**
 * @param {any} book - raw Google Books "volume" object
 * @returns {import("../../types").RawResultItem | null}
 */
function normalize(book) {
  const v = book.volumeInfo;
  if (!v || !v.title) return null;

  const year = extractYear(v.publishedDate);
  return {
    id: book.id,
    title: v.subtitle ? `${v.title}: ${v.subtitle}` : v.title,
    image: v.imageLinks ? v.imageLinks.thumbnail || v.imageLinks.smallThumbnail : null,
    year: year ?? "—",
    genres: (v.categories || []).slice(0, 2),
    summary: truncate(stripHtml(v.description), 240) || "No description available.",
    type: "book",
    link: v.infoLink,
    extra: {
      authors: v.authors ? v.authors.slice(0, 2).join(", ") : undefined,
      pageCount: v.pageCount || undefined,
      rating: v.averageRating ? `${v.averageRating}/5` : undefined,
    },
    raw: {
      categories: (v.categories || []).map((c) => c.toLowerCase()),
      averageRating: v.averageRating,
      ratingsCount: v.ratingsCount,
      pageCount: v.pageCount,
      year,
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
  const cats = item.raw.categories || [];
  const genreKey = (profile.genre || "").toLowerCase().split("/")[0];

  if (profile.genre && cats.some((c) => c.includes(genreKey))) s += 16;

  if (item.raw.averageRating) {
    s += Math.min(10, (item.raw.averageRating - 3) * 4);
    if (profile.popularity === "Popular bestseller" && item.raw.averageRating >= 4) s += 8;
    if (profile.popularity === "Underrated / hidden gem" && item.raw.ratingsCount && item.raw.ratingsCount < 500) s += 8;
  }

  const year = item.raw.year;
  if (year) {
    if (profile.era === "New release (last 2 years)" && year >= 2024) s += 12;
    if (profile.era === "Older classic" && year < 1980) s += 10;
  }

  const pages = item.raw.pageCount;
  if (pages) {
    if (profile.length === "Short (under 300 pages)" && pages < 300) s += 8;
    if (profile.length === "Long / epic (500+ pages)" && pages >= 500) s += 8;
    if (profile.length === "Medium (300-500 pages)" && pages >= 300 && pages <= 500) s += 8;
  }

  // deterministic jitter from a hash of the id (Google Books ids are alphanumeric)
  const idHash = item.id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  s += (idHash % 7) * 0.5;

  return s;
}

module.exports = {
  type: "book",
  questions: QUESTIONS,
  searchBooks,
  getBookDetails,
  buildCandidatePool,
  normalize,
  score,
};
