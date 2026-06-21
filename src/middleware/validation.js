/**
 * @fileoverview Request validation using zod (declared in package.json).
 * Validates request bodies/params before they reach route handlers, so
 * handlers can trust the shape of `req.body`/`req.params` and the engine
 * never receives malformed profiles.
 */

const { z } = require("zod");
const { AppError, ErrorCodes } = require("../utils/errors");
const { REGISTRY } = require("../engine/contentTypeRegistry");

const VALID_TYPES = Object.keys(REGISTRY);

const recommendationRequestSchema = z.object({
  type: z.enum(VALID_TYPES, {
    errorMap: () => ({ message: `type must be one of: ${VALID_TYPES.join(", ")}` }),
  }),
  profile: z.record(z.string(), z.string()).default({}),
  includeAiSummaries: z.boolean().optional(),
});

const typeParamSchema = z.object({
  type: z.enum(VALID_TYPES, {
    errorMap: () => ({ message: `type must be one of: ${VALID_TYPES.join(", ")}` }),
  }),
});

/**
 * Express middleware factory: validates `req.body` against a zod schema,
 * replacing it with the parsed (and defaulted) result on success, or
 * forwarding an AppError to the error handler on failure.
 * @param {import("zod").ZodSchema} schema
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.errors.map((e) => e.message).join("; ");
      return next(new AppError(message, ErrorCodes.INVALID_REQUEST, 400));
    }
    req.body = result.data;
    next();
  };
}

/**
 * Express middleware factory: validates `req.params` against a zod schema.
 * @param {import("zod").ZodSchema} schema
 */
function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const message = result.error.errors.map((e) => e.message).join("; ");
      return next(new AppError(message, ErrorCodes.INVALID_REQUEST, 400));
    }
    req.params = result.data;
    next();
  };
}

module.exports = {
  recommendationRequestSchema,
  typeParamSchema,
  validateBody,
  validateParams,
};
