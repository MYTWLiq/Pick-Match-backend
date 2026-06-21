/**
 * @fileoverview Public API routes for Pick Match.
 *
 *   GET  /api/content-types        -> list of categories + whether each is configured
 *   GET  /api/questions/:type      -> question set for one category
 *   POST /api/recommendations      -> run the full recommendation flow
 *
 * Validation happens via the zod schemas/middleware in middleware/validation.js
 * before any handler body runs, so handlers can trust req.body / req.params.
 */

const express = require("express");
const { asyncHandler } = require("../middleware/asyncHandler");
const {
  validateBody,
  validateParams,
  recommendationRequestSchema,
  typeParamSchema,
} = require("../middleware/validation");
const recommendationEngine = require("../engine/recommendationEngine");

const router = express.Router();

/** GET /api/content-types */
router.get(
  "/content-types",
  asyncHandler(async (req, res) => {
    res.json({ contentTypes: recommendationEngine.listContentTypes() });
  })
);

/** GET /api/questions/:type */
router.get(
  "/questions/:type",
  validateParams(typeParamSchema),
  asyncHandler(async (req, res) => {
    const { type } = req.params;
    res.json({ type, questions: recommendationEngine.getQuestions(type) });
  })
);

/** POST /api/recommendations  body: { type, profile, includeAiSummaries? } */
router.post(
  "/recommendations",
  validateBody(recommendationRequestSchema),
  asyncHandler(async (req, res) => {
    const { type, profile, includeAiSummaries } = req.body;
    const result = await recommendationEngine.getRecommendations(type, profile, {
      includeAiSummaries,
    });
    res.json(result);
  })
);

module.exports = router;
