/**
 * @fileoverview Registry mapping each ContentType key to its service module.
 * This is the single place that knows about all six content services —
 * the recommendation engine and routes never import a content service
 * directly; they go through this registry. Adding a 7th content type
 * means adding one line here (plus creating the service file itself).
 */

const tvService = require("../services/content/tvService");
const animeService = require("../services/content/animeService");
const gameService = require("../services/content/gameService");
const bookService = require("../services/content/bookService");
const movieService = require("../services/content/movieService");
const youtubeService = require("../services/content/youtubeService");
const { CONTENT_TYPES } = require("../types");
const { AppError, ErrorCodes } = require("../utils/errors");

/** @type {Object.<import("../types").ContentType, any>} */
const REGISTRY = {
  tv: tvService,
  anime: animeService,
  game: gameService,
  book: bookService,
  movie: movieService,
  youtube: youtubeService,
};

/**
 * @param {string} type
 * @returns {any} the content service module for this type
 * @throws {AppError} if the type is not recognized
 */
function getService(type) {
  const service = REGISTRY[type];
  if (!service) {
    throw new AppError(
      `Unknown content type "${type}". Valid types: ${Object.keys(REGISTRY).join(", ")}.`,
      ErrorCodes.UNKNOWN_CONTENT_TYPE,
      400
    );
  }
  return service;
}

/** @returns {{ key: string, label: string, emoji: string, enabled: boolean }[]} */
function listContentTypes() {
  return Object.entries(REGISTRY).map(([key, service]) => ({
    key,
    label: CONTENT_TYPES[key]?.label || key,
    emoji: CONTENT_TYPES[key]?.emoji || "",
    enabled: typeof service.isConfigured === "function" ? service.isConfigured() : true,
  }));
}

module.exports = { getService, listContentTypes, REGISTRY };
