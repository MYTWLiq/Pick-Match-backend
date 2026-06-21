/**
 * @fileoverview Anime content service — Jikan API (unofficial MyAnimeList API).
 * Docs: https://docs.api.jikan.moe/
 * No API key required. Public rate limit ~3 req/sec, ~60/min — respected
 * via the shared httpClient's retry-on-429 behavior and our cache layer.
 */

const config = require("../../config");
const { fetchJson } = require("../../utils/httpClient");
const { getOrSet, buildKey } = require("../../cache/cacheService");
const { truncate, extractYear } = require("../../utils/textUtils");

const SERVICE_NAME = "Jikan (MyAnimeList)";
const BASE_URL = config.apis.jikan.baseUrl;

const QUESTIONS = [
  { key: "genre", text: "What genre are you craving?", options: ["Action", "Romance", "Comedy", "Fantasy", "Slice of Life", "Horror", "Sci-Fi", "Sports", "Drama", "Mystery"] },
  { key: "era", text: "Recent release, or a classic?", options: ["This decade (2020+)", "2010s", "2000s", "90s or earlier", "Doesn't matter"] },
  { key: "length", text: "How long should it be?", options: ["Short (1 season, under 26 eps)", "Long-runner (50+ episodes)", "Movie-length", "Doesn't matter"] },
  { key: "tone", text: "Serious tone, or lighthearted?", options: ["Serious / dramatic", "Lighthearted / comedic", "Dark / intense", "A mix"] },
  { key: "popularity", text: "Mainstream favorite, or underrated?", options: ["Popular / widely loved", "Underrated / hidden gem", "Either is fine"] },
  { key: "audience", text: "Any audience rating preference?", options: ["Shonen (general action)", "Seinen (mature)", "Shojo (romance-leaning)", "No preference"] },
  { key: "artstyle", text: "Any art style preference?", options: ["Classic hand-drawn", "Modern polished CG", "Doesn't matter"] },
  { key: "source", text: "Adapted from manga, light novel, or original?", options: ["Manga adaptation", "Light novel adaptation", "Original anime", "No preference"] },
  { key: "studio", text: "Care about studio pedigree?", options: ["Yes, prefer acclaimed studios", "No preference"] },
  { key: "avoid", text: "Anything you want to avoid?", options: ["Excessive fan service", "Sad / tragic endings", "Filler-heavy pacing", "Nothing — I'm open"] },
];

/**
 * Searches anime by free-text query, ordered by score.
 * @param {string} query
 * @returns {Promise<any[]>} raw Jikan anime objects
 */
async function searchAnime(query) {
  const cacheKey = buildKey("jikan:search", { query });
  return getOrSet(cacheKey, async () => {
    const url = `${BASE_URL}/anime?q=${encodeURIComponent(query)}&order_by=score&sort=desc&limit=25`;
    const data = await fetchJson(url, SERVICE_NAME);
    return data?.data || [];
  });
}

/**
 * Fetches full details (including studios/synopsis) for a single anime by MAL id.
 * @param {number|string} animeId
 */
async function getAnimeDetails(animeId) {
  const cacheKey = buildKey("jikan:anime", { animeId });
  return getOrSet(cacheKey, async () => {
    const url = `${BASE_URL}/anime/${animeId}/full`;
    const data = await fetchJson(url, SERVICE_NAME);
    return data?.data;
  });
}

/**
 * @param {import("../../types").UserProfile} profile
 * @returns {Promise<any[]>}
 */
async function buildCandidatePool(profile) {
  const term = profile.genre || "popular";
  const results = await searchAnime(term);
  // de-dupe defensively (Jikan search results are already unique, but
  // this guards against future multi-term widening)
  const seen = new Set();
  return results.filter((a) => {
    if (!a || seen.has(a.mal_id)) return false;
    seen.add(a.mal_id);
    return true;
  });
}

/**
 * @param {any} anime
 * @returns {import("../../types").RawResultItem}
 */
function normalize(anime) {
  const year = anime.aired?.prop?.from?.year ?? extractYear(anime.aired?.string);
  return {
    id: String(anime.mal_id),
    title: anime.title,
    image: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || null,
    year: year ?? "—",
    genres: (anime.genres || []).slice(0, 3).map((g) => g.name),
    summary: truncate(anime.synopsis, 240) || "No synopsis available.",
    type: "anime",
    link: anime.url,
    extra: {
      episodes: anime.episodes || undefined,
      studio: anime.studios?.[0]?.name || undefined,
      malScore: anime.score || undefined,
    },
    raw: {
      score: anime.score,
      members: anime.members,
      episodes: anime.episodes,
      animeType: anime.type, // "TV" | "Movie" | "OVA" etc.
      year,
      genres: (anime.genres || []).map((g) => g.name.toLowerCase()),
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
  const genres = item.raw.genres || [];

  if (profile.genre && genres.some((g) => g.includes(profile.genre.toLowerCase()))) s += 18;

  if (profile.popularity === "Popular / widely loved" && item.raw.members > 200000) s += 10;
  if (profile.popularity === "Underrated / hidden gem" && item.raw.members && item.raw.members < 80000) s += 10;

  const year = item.raw.year;
  if (year) {
    if (profile.era === "This decade (2020+)" && year >= 2020) s += 12;
    if (profile.era === "2010s" && year >= 2010 && year < 2020) s += 10;
    if (profile.era === "2000s" && year >= 2000 && year < 2010) s += 10;
    if (profile.era === "90s or earlier" && year < 1999) s += 10;
  }

  const episodes = item.raw.episodes;
  if (profile.length === "Short (1 season, under 26 eps)" && episodes && episodes <= 26) s += 10;
  if (profile.length === "Long-runner (50+ episodes)" && episodes && episodes >= 50) s += 12;
  if (profile.length === "Movie-length" && item.raw.animeType === "Movie") s += 14;

  if (item.raw.score) s += Math.min(12, (item.raw.score - 6) * 2.2);

  const jitter = (parseInt(item.id, 10) % 7) * 0.5;
  s += jitter;

  return s;
}

module.exports = {
  type: "anime",
  questions: QUESTIONS,
  searchAnime,
  getAnimeDetails,
  buildCandidatePool,
  normalize,
  score,
};
