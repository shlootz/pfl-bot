/**
 * extractIDFromURL.js
 *
 * Given either:
 *   - a pure horse ID
 *   - OR a full PFL URL (e.g. https://photofinish.live/horses/<id>)
 * returns the extracted horse ID.
 *
 * If the input is empty, returns null.
 */

function extractIDFromURL(input) {
  if (!input) return null;

  console.log('extracting '+input);

  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    return pathSegments[pathSegments.length - 1] || null;
  } catch (e) {
    // Not a URL — assume it's the ID itself
    return trimmed;
  }
}

module.exports = extractIDFromURL;