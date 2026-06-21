/**
 * @fileoverview OpenAI summary provider.
 * Uses the `openai` package (declared as an optionalDependency).
 * Same lazy-require + isAvailable() pattern as the Claude provider.
 */

const config = require("../../../config");
const { buildSummaryPrompt } = require("../aiProviderInterface");
const { AppError, ErrorCodes } = require("../../../utils/errors");

let OpenAISDK = null;
let sdkLoadError = null;
try {
  OpenAISDK = require("openai");
} catch (err) {
  sdkLoadError = err;
}

let client = null;
function getClient() {
  if (!client && OpenAISDK) {
    const OpenAI = OpenAISDK.default || OpenAISDK;
    client = new OpenAI({ apiKey: config.ai.openai.apiKey });
  }
  return client;
}

function isAvailable() {
  const hasKey = Boolean(config.ai.openai.apiKey) && !config.ai.openai.apiKey.startsWith("your_");
  return hasKey && OpenAISDK !== null;
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
        ? "The openai package isn't installed. Run npm install."
        : "OPENAI_API_KEY is not configured.",
      ErrorCodes.AI_PROVIDER_ERROR,
      503
    );
  }

  const openai = getClient();
  const prompt = buildSummaryPrompt(item, profile);

  try {
    const response = await openai.chat.completions.create({
      model: config.ai.openai.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
    });

    return response.choices?.[0]?.message?.content?.trim() || "";
  } catch (err) {
    throw new AppError(
      "OpenAI summary generation failed.",
      ErrorCodes.AI_PROVIDER_ERROR,
      502,
      { cause: err }
    );
  }
}

module.exports = {
  name: "openai",
  isAvailable,
  summarize,
};
