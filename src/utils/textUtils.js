/**
 * @fileoverview Small text-cleaning helpers shared by every content service.
 */

/** Strips HTML tags from a string (TVmaze and some other APIs return HTML summaries). */
function stripHtml(str) {
  if (!str) return "";
  return str.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/** Truncates text to `maxLength` chars, stripping HTML first, adding an ellipsis if cut. */
function truncate(str, maxLength = 220) {
  const clean = stripHtml(str);
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength).trim() + "…";
}

/** Extracts a 4-digit year from a date-like string ("2021-05-03" -> 2021), or null. */
function extractYear(dateStr) {
  if (!dateStr) return null;
  const match = String(dateStr).match(/\d{4}/);
  return match ? parseInt(match[0], 10) : null;
}

/** Escapes a string for safe inclusion in JSON/log output (defensive; Express/JSON already escape). */
function safeString(value) {
  return value === null || value === undefined ? "" : String(value);
}

module.exports = { stripHtml, truncate, extractYear, safeString };
