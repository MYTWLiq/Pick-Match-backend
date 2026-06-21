/**
 * @fileoverview YouTube content service — YouTube Data API v3.
 * Docs: https://developers.google.com/youtube/v3/docs
 * REQUIRES a secret API key (YOUTUBE_API_KEY). Like TMDB, this must run
 * server-side only — the key is never sent to the browser.
 *
 * Quota note: YouTube's free quota is 10,000 units/day, and a single
 * search.list call costs 100 units (so ~100 searches/day on the free
 * tier). The cache layer is especially important here to avoid burning
 * quota on repeated/similar questionnaire answers.
 */

const config = require("../../config");
const { fetchJson } = require("../../utils/httpClient");
const { getOrSet, buildKey } = require("../../cache/cacheService");
const { truncate, extractYear } = require("../../utils/textUtils");
const { MissingApiKeyError } = require("../../utils/errors");

const SERVICE_NAME = "YouTube Data API";
const BASE_URL = config.apis.youtube.baseUrl;

const QUESTIONS = [
  { key: "genre", text: "What kind of video are you after?", options: ["Tutorial / How-to", "Documentary", "Comedy / Entertainment", "Music", "Gaming", "Tech Review", "Vlog", "Educational"] },
  { key: "length", text: "How long should it be?", options: ["Short (under 4 min)", "Medium (4-20 min)", "Long-form (20+ min)", "Doesn't matter"] },
  { key: "era", text: "Recent upload, or doesn't matter?", options: ["Last month", "Last year", "Doesn't matter"] },
  { key: "tone", text: "Serious and informative, or entertaining?", options: ["Serious / informative", "Entertaining / fun", "A mix"] },
  { key: "popularity", text: "Big channel, or smaller creator?", options: ["Big well-known channel", "Smaller / indie creator", "Either is fine"] },
  { key: "language", text: "Language preference?", options: ["English", "Any language"] },
  { key: "quality", text: "Care about production quality?", options: ["Highly produced", "Casual / authentic is fine", "No preference"] },
  { key: "purpose", text: "Watching to learn, or to relax?", options: ["Learn something", "Relax / unwind", "Both"] },
  { key: "captions", text: "Need captions/subtitles?", options: ["Yes, important", "Not necessary"] },
  { key: "avoid", text: "Anything to avoid?", options: ["Clickbait-y content", "Overly long intros", "Nothing — I'm open"] },
];

const DURATION_MAP = {
  "Short (under 4 min)": "short",
  "Medium (4-20 min)": "medium",
  "Long-form (20+ min)": "long",
};

function assertConfigured() {
  if (!config.apis.youtube.apiKey || config.apis.youtube.apiKey.startsWith("your_")) {
    throw new MissingApiKeyError("YOUTUBE_API_KEY", "YouTube Data API v3");
  }
}

function isoDurationToMinutes(iso) {
  if (!iso) return null;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const [, h, m, s] = match;
  return (parseInt(h || 0, 10) * 60) + parseInt(m || 0, 10) + (parseInt(s || 0, 10) / 60);
}

/**
 * Searches videos by free-text query. Returns search results enriched
 * with statistics + contentDetails via a follow-up videos.list call
 * (search.list alone doesn't include view counts or duration).
 * @param {string} query
 * @param {{ duration?: string, publishedAfter?: string }} [options]
 * @returns {Promise<any[]>} merged search+details objects
 */
async function searchVideos(query, options = {}) {
  assertConfigured();
  const cacheKey = buildKey("youtube:search", { query, ...options });
  return getOrSet(cacheKey, async () => {
    const searchParams = new URLSearchParams({
      part: "snippet",
      type: "video",
      maxResults: "25",
      q: query,
      key: config.apis.youtube.apiKey,
      safeSearch: "moderate",
    });
    if (options.duration) searchParams.set("videoDuration", options.duration);
    if (options.publishedAfter) searchParams.set("publishedAfter", options.publishedAfter);

    const searchUrl = `${BASE_URL}/search?${searchParams.toString()}`;
    const searchData = await fetchJson(searchUrl, SERVICE_NAME);
    const items = searchData?.items || [];
    if (items.length === 0) return [];

    const videoIds = items.map((it) => it.id.videoId).filter(Boolean).join(",");
    const detailsUrl = `${BASE_URL}/videos?part=snippet,statistics,contentDetails&id=${videoIds}&key=${config.apis.youtube.apiKey}`;
    const detailsData = await fetchJson(detailsUrl, SERVICE_NAME);
    return detailsData?.items || [];
  });
}

/**
 * Fetches full details for a single video by id (snippet+statistics+contentDetails).
 * @param {string} videoId
 */
async function getVideoDetails(videoId) {
  assertConfigured();
  const cacheKey = buildKey("youtube:video", { videoId });
  return getOrSet(cacheKey, async () => {
    const url = `${BASE_URL}/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${config.apis.youtube.apiKey}`;
    const data = await fetchJson(url, SERVICE_NAME);
    return data?.items?.[0] || null;
  });
}

/**
 * @param {import("../../types").UserProfile} profile
 * @returns {Promise<any[]>}
 */
async function buildCandidatePool(profile) {
  const query = profile.genre || "popular videos";
  const options = {};
  if (DURATION_MAP[profile.length]) options.duration = DURATION_MAP[profile.length];

  if (profile.era === "Last month") {
    options.publishedAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  } else if (profile.era === "Last year") {
    options.publishedAfter = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  }

  return searchVideos(query, options);
}

/**
 * @param {any} video - raw YouTube video resource (snippet+statistics+contentDetails)
 * @returns {import("../../types").RawResultItem}
 */
function normalize(video) {
  const snippet = video.snippet || {};
  const stats = video.statistics || {};
  const durationMin = isoDurationToMinutes(video.contentDetails?.duration);

  return {
    id: video.id,
    title: snippet.title,
    image: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || null,
    year: extractYear(snippet.publishedAt) ?? "—",
    genres: snippet.tags ? snippet.tags.slice(0, 3) : [],
    summary: truncate(snippet.description, 220) || "No description available.",
    type: "youtube",
    link: `https://www.youtube.com/watch?v=${video.id}`,
    extra: {
      channel: snippet.channelTitle || undefined,
      views: stats.viewCount ? formatViewCount(stats.viewCount) : undefined,
      duration: durationMin ? `${Math.round(durationMin)} min` : undefined,
      publishedAt: snippet.publishedAt ? snippet.publishedAt.slice(0, 10) : undefined,
    },
    raw: {
      viewCount: stats.viewCount ? parseInt(stats.viewCount, 10) : 0,
      likeCount: stats.likeCount ? parseInt(stats.likeCount, 10) : 0,
      durationMin,
      publishedAt: snippet.publishedAt,
    },
  };
}

function formatViewCount(viewCountStr) {
  const n = parseInt(viewCountStr, 10);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}

/**
 * @param {import("../../types").RawResultItem} item
 * @param {import("../../types").UserProfile} profile
 * @returns {number}
 */
function score(item, profile) {
  let s = 55;

  const views = item.raw.viewCount || 0;
  if (profile.popularity === "Big well-known channel" && views > 500000) s += 14;
  if (profile.popularity === "Smaller / indie creator" && views < 50000) s += 12;
  if (profile.popularity === "Either is fine") s += 6;

  s += Math.min(10, Math.log10(views + 1) * 1.5);

  const durationMin = item.raw.durationMin;
  if (durationMin) {
    if (profile.length === "Short (under 4 min)" && durationMin < 4) s += 12;
    if (profile.length === "Medium (4-20 min)" && durationMin >= 4 && durationMin <= 20) s += 12;
    if (profile.length === "Long-form (20+ min)" && durationMin > 20) s += 12;
  }

  if (item.raw.likeCount && views) {
    const likeRatio = item.raw.likeCount / views;
    s += Math.min(6, likeRatio * 1000);
  }

  const idHash = item.id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  s += (idHash % 7) * 0.4;

  return s;
}

module.exports = {
  type: "youtube",
  questions: QUESTIONS,
  searchVideos,
  getVideoDetails,
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
