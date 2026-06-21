/**
 * @fileoverview Video Games content service — FreeToGame API.
 * Docs: https://www.freetogame.com/api-doc
 * No API key required. Covers only free-to-play / MMO titles — this is
 * a real coverage limitation (no general retail game catalog) that is
 * surfaced to the client via the `coverageNote` export, not hidden.
 */

const config = require("../../config");
const { fetchJson } = require("../../utils/httpClient");
const { getOrSet, buildKey } = require("../../cache/cacheService");
const { truncate, extractYear } = require("../../utils/textUtils");

const SERVICE_NAME = "FreeToGame";
const BASE_URL = config.apis.freeToGame.baseUrl;

const QUESTIONS = [
  { key: "genre", text: "What genre are you after?", options: ["Shooter", "MMORPG", "Strategy", "Racing", "Sports", "Card Game", "Fighting", "Battle Royale", "MOBA", "Fantasy"] },
  { key: "platform", text: "What platform will you play on?", options: ["PC", "Browser (no download)", "Either"] },
  { key: "era", text: "Recent release, or doesn't matter?", options: ["Recently released", "Doesn't matter"] },
  { key: "tone", text: "Competitive multiplayer, or relaxed solo?", options: ["Competitive PvP", "Co-op with friends", "Relaxed solo", "Mix of everything"] },
  { key: "popularity", text: "Big hit, or underrated gem?", options: ["Popular / well-known", "Underrated / hidden gem", "Either is fine"] },
  { key: "pace", text: "Fast-paced action, or slower strategy?", options: ["Fast-paced", "Slow, tactical", "Either"] },
  { key: "setting", text: "Any setting that draws you in?", options: ["Sci-fi / futuristic", "Fantasy", "Modern / realistic", "No preference"] },
  { key: "session", text: "Quick sessions, or long deep play?", options: ["Quick 15-30 min sessions", "Long immersive sessions", "Either"] },
  { key: "graphics", text: "Any graphics style preference?", options: ["2D / pixel art", "Stylized 3D", "Realistic 3D", "No preference"] },
  { key: "avoid", text: "Anything to avoid?", options: ["Pay-to-win mechanics", "Heavy grinding", "Steep learning curve", "Nothing — I'm open"] },
];

/** Coverage limitation, surfaced to the client by the recommendation engine. */
const COVERAGE_NOTE =
  "Powered by FreeToGame — covers free-to-play & MMO titles only. Paid/retail games aren't in this database.";

/**
 * Fetches the full games list, optionally filtered by category/platform.
 * FreeToGame has no free-text search endpoint — filtering is done via
 * category/platform/sort query params, then matched client-side against
 * the user's free-text-ish genre answer.
 * @param {{ category?: string, platform?: string, sortBy?: string }} filters
 * @returns {Promise<any[]>}
 */
async function fetchGames(filters = {}) {
  const cacheKey = buildKey("freetogame:games", filters);
  return getOrSet(cacheKey, async () => {
    const params = new URLSearchParams();
    if (filters.category) params.set("category", filters.category);
    if (filters.platform) params.set("platform", filters.platform);
    if (filters.sortBy) params.set("sort-by", filters.sortBy);
    const qs = params.toString();
    const url = `${BASE_URL}/games${qs ? `?${qs}` : ""}`;
    return fetchJson(url, SERVICE_NAME);
  });
}

/**
 * Fetches full details for a single game by FreeToGame id.
 * @param {number|string} gameId
 */
async function getGameDetails(gameId) {
  const cacheKey = buildKey("freetogame:game", { gameId });
  return getOrSet(cacheKey, async () => {
    const url = `${BASE_URL}/game?id=${gameId}`;
    return fetchJson(url, SERVICE_NAME);
  });
}

const PLATFORM_MAP = {
  PC: "pc",
  "Browser (no download)": "browser",
  Either: undefined,
};

/**
 * @param {import("../../types").UserProfile} profile
 * @returns {Promise<any[]>}
 */
async function buildCandidatePool(profile) {
  const filters = {
    category: profile.genre ? profile.genre.toLowerCase() : undefined,
    platform: PLATFORM_MAP[profile.platform],
    sortBy: profile.era === "Recently released" ? "release-date" : "popularity",
  };

  let games = await fetchGames(filters);

  // FreeToGame's category filter is strict and can return an empty list
  // for valid-but-uncommon genre/category names. Fall back to the
  // unfiltered popular list so the user still gets results.
  if (!games || games.length === 0) {
    games = await fetchGames({ sortBy: "popularity" });
  }
  return games || [];
}

/**
 * @param {any} game
 * @returns {import("../../types").RawResultItem}
 */
function normalize(game) {
  return {
    id: String(game.id),
    title: game.title,
    image: game.thumbnail || null,
    year: extractYear(game.release_date) ?? "—",
    genres: [game.genre, game.platform].filter(Boolean),
    summary: truncate(game.short_description, 220) || "No description available.",
    type: "game",
    link: game.game_url,
    extra: {
      publisher: game.publisher || undefined,
      developer: game.developer || undefined,
      platform: game.platform || undefined,
      pricing: "Free-to-play",
    },
    raw: {
      genre: (game.genre || "").toLowerCase(),
      platform: (game.platform || "").toLowerCase(),
      releaseDate: game.release_date,
      year: extractYear(game.release_date),
    },
  };
}

/**
 * @param {import("../../types").RawResultItem} item
 * @param {import("../../types").UserProfile} profile
 * @returns {number}
 */
function score(item, profile) {
  let s = 58;

  if (profile.genre && item.raw.genre.includes(profile.genre.toLowerCase())) s += 18;

  if (profile.platform && profile.platform !== "Either") {
    const wanted = PLATFORM_MAP[profile.platform];
    if (wanted && item.raw.platform.includes(wanted)) s += 12;
  }

  if (profile.era === "Recently released" && item.raw.year && item.raw.year >= 2022) s += 10;

  if (profile.popularity === "Popular / well-known") s += 5;

  const jitter = (parseInt(item.id, 10) % 9) * 0.7;
  s += jitter;

  return s;
}

module.exports = {
  type: "game",
  questions: QUESTIONS,
  coverageNote: COVERAGE_NOTE,
  fetchGames,
  getGameDetails,
  buildCandidatePool,
  normalize,
  score,
};
