/**
 * @fileoverview Claude (Anthropic) summary provider.
 * Uses @anthropic-ai/sdk (declared as an optionalDependency in package.json).
 * The SDK is required lazily inside summarize() so that a missing/failed
 * install of this one optional package can't crash the whole server —
 * isAvailable() checks both the API key AND that the SDK loaded.
 */

const config = require("../../../config");
const { buildSummaryPrompt } = require("../aiProviderInterface");
const { AppError, ErrorCodes } = require("../../../utils/errors");

let AnthropicSDK = null;
let sdkLoadError = null;
try {
  AnthropicSDK = require("@anthropic-ai/sdk");
} catch (err) {
  sdkLoadError = err;
}

let client = null;
function getClient() {
  if (!client && AnthropicSDK) {
    client = new AnthropicSDK.Anthropic({ apiKey: config.ai.claude.apiKey });
  }
  return client;
}

function isAvailable() {
  const hasKey = Boolean(config.ai.claude.apiKey) && !config.ai.claude.apiKey.startsWith("your_");
  return hasKey && AnthropicSDK !== null;
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
        ? "The @anthropic-ai/sdk package isn't installed. Run npm install."
        : "ANTHROPIC_API_KEY is not configured.",
      ErrorCodes.AI_PROVIDER_ERROR,
      503
    );
  }

  const anthropic = getClient();
  const prompt = buildSummaryPrompt(item, profile);

  try {
    const response = await anthropic.messages.create({
      model: config.ai.claude.model,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    return textBlock ? textBlock.text.trim() : "";
  } catch (err) {
    throw new AppError(
      "Claude summary generation failed.",
      ErrorCodes.AI_PROVIDER_ERROR,
      502,
      { cause: err }
    );
  }
}

module.exports = {
  name: "claude",
  isAvailable,
  summarize,
};
