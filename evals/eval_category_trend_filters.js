// eval_category_trend_filters.js
// ---------------------------------------------------------------------------
// Golden-set regression eval for matchesFilter() (lib/trendFilterMatch.js),
// run against the real category_trend_filters data (filters.json - keep
// this in sync with the actual table; re-export it whenever you edit
// keywords in Supabase).
//
// No network calls, no Supabase - safe to run on every commit.
//
// Usage:
//   node eval_category_trend_filters.js                  # human output
//   node eval_category_trend_filters.js --json             # machine-readable
//   node eval_category_trend_filters.js --fail-under 0.95  # soft threshold
//   node eval_category_trend_filters.js --label GAP        # only cases whose
//                                                            label contains "GAP"
//
// Golden cases live in golden_trend_filter_cases.json:
//   { "category_id": 132, "input": "...", "should_match": true, "label": "..." }
// ---------------------------------------------------------------------------

const fs = require("fs")
const path = require("path")
const { matchesFilter } = require("../lib/trendFilterMatch.js")

const args = process.argv.slice(2)
const asJson = args.includes("--json")
const failUnderIdx = args.indexOf("--fail-under")
const failUnder = failUnderIdx !== -1 ? parseFloat(args[failUnderIdx + 1]) : 1.0
const labelIdx = args.indexOf("--label")
const labelFilter = labelIdx !== -1 ? args[labelIdx + 1] : null

const filters = JSON.parse(fs.readFileSync(path.join(__dirname, "filters.json"), "utf8"))
let cases = JSON.parse(fs.readFileSync(path.join(__dirname, "golden_trend_filter_cases.json"), "utf8"))

if (labelFilter) {
  cases = cases.filter(c => c.label.toLowerCase().includes(labelFilter.toLowerCase()))
}
if (cases.length === 0) {
  console.error(`No golden cases matched label filter ${JSON.stringify(labelFilter)}`)
  process.exit(2)
}

const byCat = {}
for (const f of filters) byCat[f.category_id] = f

const results = cases.map(c => {
  const f = byCat[c.category_id]
  if (!f) {
    return { ...c, got: null, pass: false, error: `no filter row for category_id ${c.category_id}` }
  }
  const got = matchesFilter(c.input, f.match_keywords, f.exclude_keywords)
  return { ...c, got, pass: got === c.should_match }
})

const passed = results.filter(r => r.pass).length
const total = results.length
const accuracy = total ? passed / total : 0

if (asJson) {
  console.log(JSON.stringify({
    summary: { total, passed, accuracy },
    failures: results.filter(r => !r.pass),
  }, null, 2))
} else {
  const failures = results.filter(r => !r.pass)
  if (failures.length) {
    console.log("Regressions:\n")
    for (const r of failures) {
      console.log(`  ✗ [${r.label}]`)
      console.log(`     category_id: ${r.category_id}   input: ${r.input}`)
      console.log(`     expected match=${r.should_match}   got match=${r.got}${r.error ? "   error: " + r.error : ""}`)
    }
    console.log()
  }
  console.log(`${passed}/${total} passed (${(accuracy * 100).toFixed(1)}%)`)
  if (failures.length) console.log(`${failures.length} regression(s) - see above`)
}

process.exit(accuracy < failUnder ? 1 : 0)
