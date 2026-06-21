/**
 * @fileoverview Google Gemini summary provider.
 * Uses `@google/generative-ai` (declared as an optionalDependency).
 * Same lazy-require + isAvailable() pattern as the other LLM providers.
 */

const config = require("../../../config");
const { buildSummaryPrompt } = require("../aiProviderInterface");
const { AppError, ErrorCodes } = require("../../../utils/errors");

let GoogleGenerativeAI = null;
let sdkLoadError = null;
try {
  GoogleGenerativeAI = require("@google/generative-ai").GoogleGenerativeAI;
} catch (err) {
  sdkLoadError = err;
}

let client = null;
function getClient() {
  if (!client && GoogleGenerativeAI) {
    client = new GoogleGenerativeAI(config.ai.gemini.apiKey);
  }
  return client;
}

function isAvailable() {
  const hasKey = Boolean(config.ai.gemini.apiKey) && !config.ai.gemini.apiKey.startsWith("your_");
  return hasKey && GoogleGenerativeAI !== null;
}

/**
 * @param {import("../../../types").RawResultItem} item
 * @param {import("../../../types").UserProfile} profile
 * @returns {Promise<string>}
 */
async function summarize(item, profile) {
  if (!isAvailable()) {
    throw new AppError(
      sdkLoadError
        ? "The @google/generative-ai package isn't installed. Run npm install."
        : "GEMINI_API_KEY is not configured.",
      ErrorCodes.AI_PROVIDER_ERROR,
      503
    );
  }

  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: config.ai.gemini.model });
  const prompt = buildSummaryPrompt(item, profile);

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    throw new AppError(
      "Gemini summary generation failed.",
      ErrorCodes.AI_PROVIDER_ERROR,
      502,
      { cause: err }
    );
  }
}

module.exports = {
  name: "gemini",
  isAvailable,
  summarize,
};
