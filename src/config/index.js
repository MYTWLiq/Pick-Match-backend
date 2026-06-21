/**
 * @fileoverview Single source of truth for runtime configuration.
 * Every other file reads config from here, never from process.env directly
 * (except this file and validateEnv.js) — this keeps env access centralized
 * and makes it trivial to see every config value the app depends on.
 */

require("dotenv").config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigin: process.env.CORS_ORIGIN || "*",

  cache: {
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS, 10) || 1800,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 60,
  },

  apis: {
    tmdb: {
      apiKey: process.env.TMDB_API_KEY || "",
      baseUrl: "https://api.themoviedb.org/3",
      imageBaseUrl: "https://image.tmdb.org/t/p/w500",
    },
    youtube: {
      apiKey: process.env.YOUTUBE_API_KEY || "",
      baseUrl: "https://www.googleapis.com/youtube/v3",
    },
    tvmaze: {
      baseUrl: "https://api.tvmaze.com",
    },
    jikan: {
      baseUrl: "https://api.jikan.moe/v4",
    },
    freeToGame: {
      baseUrl: "https://www.freetogame.com/api",
    },
    googleBooks: {
      baseUrl: "https://www.googleapis.com/books/v1",
    },
  },

  ai: {
    provider: (process.env.AI_PROVIDER || "claude").toLowerCase(),
    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY || "",
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || "",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || "",
      model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
    },
  },
};

module.exports = config;
