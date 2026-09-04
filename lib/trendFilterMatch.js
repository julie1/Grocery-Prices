// lib/trendFilterMatch.js
// Extracted from app/api/categories/route.ts so eval_category_trend_filters.js
// can import the exact same matching logic that runs in production, instead
// of a hand-copied reimplementation that could silently drift out of sync.
function matchesFilter(name, keywords, excludes) {
  const n = name.toLowerCase()
  if (excludes.some(ex => n.includes(ex.toLowerCase()))) return false
  return keywords.some(kw => n.includes(kw.toLowerCase()))
}

module.exports = { matchesFilter }
