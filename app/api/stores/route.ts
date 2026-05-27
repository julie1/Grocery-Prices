// app/api/stores/route.ts
// =============================================================================
// GET /api/stores
// =============================================================================
//
// No params.  Returns all stores with metadata from v_store_summary.
//
// Response:
// {
//   stores: [
//     {
//       id: 1,
//       name: "Safeway",
//       location: "Spokane, WA",
//       latest_ad_date: "2025-05-14",
//       total_ads: 18,
//       total_prices: 3420,
//       unnormalized_prices: 0
//     }, ...
//   ]
// }
//
// Frontend uses this to:
//   1. Render the store picker tabs (Yokes | Safeway | Rosauers | Fred Meyer)
//   2. Show "Last updated: May 14" under each store name
//   3. Optionally show a warning badge if unnormalized_prices > 0
//      (meaning normalize_agent hasn't run since the latest ingest)
//
// Cached for 10 minutes — store metadata almost never changes intra-day.
// =============================================================================

import { NextResponse }       from "next/server"
import { createServerClient } from "@/lib/supabase"

export async function GET() {
  const sb = createServerClient()

  try {
    const { data, error } = await sb
      .from("v_store_summary")
      .select("*")
      .order("name")

    if (error) throw error

    return NextResponse.json(
      { stores: data ?? [] },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    )
  } catch (err) {
    console.error("[/api/stores]", err)
    return NextResponse.json({ error: "Failed to load stores" }, { status: 500 })
  }
}
