/**
 * @fileoverview Validates environment variables at startup.
 *
 * Philosophy: the server should always START, even with missing optional
 * keys — but it should be loud and specific about what's missing, and
 * each affected feature should fail gracefully (clear error) rather than
 * crash or silently return wrong data.
 *
 * Run standalone with: npm run validate-env
 */

require("dotenv").config();

/** @typedef {{ key: string, required: boolean, feature: string, hint: string }} EnvSpec */

/** @type {EnvSpec[]} */
const ENV_SPECS = [
  {
    key: "TMDB_API_KEY",
    required: true,
    feature: "Movies (TMDB)",
    hint: "Get a free key at https://www.themoviedb.org/settings/api",
  },
  {
    key: "YOUTUBE_API_KEY",
    required: true,
    feature: "YouTube Data API v3",
    hint: "Enable YouTube Data API v3 and create a key in Google Cloud Console.",
  },
  {
    key: "ANTHROPIC_API_KEY",
    required: false,
    feature: "AI Summaries (Claude provider)",
    hint: "Only required if AI_PROVIDER=claude. Get a key at https://console.anthropic.com/settings/keys",
  },
  {
    key: "OPENAI_API_KEY",
    required: false,
    feature: "AI Summaries (OpenAI provider)",
    hint: "Only required if AI_PROVIDER=openai.",
  },
  {
    key: "GEMINI_API_KEY",
    required: false,
    feature: "AI Summaries (Gemini provider)",
    hint: "Only required if AI_PROVIDER=gemini.",
  },
];

const PLACEHOLDER_PATTERN = /^your_.*_(here|key)$/i;

/**
 * @param {string|undefined} value
 * @returns {boolean} true if the value is unset or still a placeholder string.
 */
function isUnsetOrPlaceholder(value) {
  if (!value || value.trim() === "") return true;
  return PLACEHOLDER_PATTERN.test(value.trim());
}

/**
 * Validates env vars and returns a structured report.
 * Never throws — callers decide what to do with missing required vars.
 * @returns {{ ok: boolean, missingRequired: EnvSpec[], missingOptional: EnvSpec[], configured: string[] }}
 */
function validateEnv() {
  const missingRequired = [];
  const missingOptional = [];
  const configured = [];

  for (const spec of ENV_SPECS) {
    const value = process.env[spec.key];
    if (isUnsetOrPlaceholder(value)) {
      (spec.required ? missingRequired : missingOptional).push(spec);
    } else {
      configured.push(spec.key);
    }
  }

  // Cross-check: the selected AI_PROVIDER must have its key configured,
  // otherwise we should warn even though the individual key is "optional"
  // in the general sense.
  const provider = (process.env.AI_PROVIDER || "claude").toLowerCase();
  const providerKeyMap = {
    claude: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    gemini: "GEMINI_API_KEY",
  };
  const requiredKeyForProvider = providerKeyMap[provider];
  const providerKeyMissing =
    requiredKeyForProvider && isUnsetOrPlaceholder(process.env[requiredKeyForProvider]);

  return {
    ok: missingRequired.length === 0,
    missingRequired,
    missingOptional,
    configured,
    activeAiProvider: provider,
    providerKeyMissing,
  };
}

/** Pretty-prints the validation report to the console. */
function printEnvReport() {
  const report = validateEnv();

  console.log("\n──────────────────────────────────────────────");
  console.log(" Pick Match — Environment Check");
  console.log("──────────────────────────────────────────────");

  if (report.configured.length) {
    console.log(`✅ Configured: ${report.configured.join(", ")}`);
  }

  if (report.missingRequired.length) {
    console.log("\n❌ MISSING REQUIRED variables — these features will return errors until set:");
    for (const spec of report.missingRequired) {
      console.log(`   • ${spec.key}  (${spec.feature})`);
      console.log(`     → ${spec.hint}`);
    }
  }

  if (report.missingOptional.length) {
    console.log("\n⚠️  Not configured (optional):");
    for (const spec of report.missingOptional) {
      console.log(`   • ${spec.key}  (${spec.feature})`);
    }
  }

  console.log(`\n🤖 AI_PROVIDER = "${report.activeAiProvider}"`);
  if (report.activeAiProvider === "local") {
    console.log("   Using the built-in rule-based summarizer. No API key needed.");
  } else if (report.providerKeyMissing) {
    console.log(
      `   ⚠️  No valid key found for this provider. Summaries will automatically fall back to the local summarizer.`
    );
  } else {
    console.log("   Key found — this provider will be used for AI summaries.");
  }

  console.log("──────────────────────────────────────────────\n");

  return report;
}

if (require.main === module) {
  const report = printEnvReport();
  process.exit(report.ok ? 0 : 1);
}

module.exports = { validateEnv, printEnvReport, ENV_SPECS, isUnsetOrPlaceholder };
