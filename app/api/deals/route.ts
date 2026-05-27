// app/api/deals/route.ts
// =============================================================================
// GET /api/deals
// =============================================================================
//
// Query params:
//   store     — required. e.g. "Safeway"
//   category  — optional filter, e.g. "dairy"
//   limit     — default 60, max 200
//   offset    — default 0
//
// Returns: { deals: DealRow[], total: number, ad_date: string|null, store: string }
//
// This is the "browse this week's circular" endpoint — different from /api/search.
//
// /api/search  → canonical products, one row per product, aggregated prices
// /api/deals   → raw price rows from the store's latest ad, including items
//                not yet normalized (raw_product_name, no canonical id).
//                This is what powers the per-store tab view.
//
// Including unnormalized rows matters during the early weeks when normalize_agent
// hasn't run yet — users still see the full circular, just without comparison
// data for the unmatched items.
//
// Results are sorted by category_name then sale_price so the output reads like
// a naturally organized store circular.
// =============================================================================

import { NextRequest, NextResponse } from "next/server"
import { createServerClient }        from "@/lib/supabase"

const CACHE = "public, s-maxage=300, stale-while-revalidate=3600"

export async function GET(request: NextRequest) {
  const sp       = request.nextUrl.searchParams
  const store    = sp.get("store")?.trim()    ?? ""
  const category = sp.get("category")?.trim() ?? ""
  const limit    = Math.min(parseInt(sp.get("limit")  ?? "60",  10), 200)
  const offset   = Math.max(parseInt(sp.get("offset") ?? "0",   10), 0)

  if (!store) {
    return NextResponse.json(
      { error: "store parameter is required" },
      { status: 400 }
    )
  }

  const sb = createServerClient()

  try {
    let query = sb
      .from("v_current_week_deals")
      .select("*", { count: "exact" })
      .ilike("store_name", store)
      .order("category_name", { ascending: true,  nullsFirst: false })
      .order("sale_price",    { ascending: true  })
      .range(offset, offset + limit - 1)

    if (category) {
      query = query.ilike("category_name", category)
    }

    const { data, error, count } = await query
    if (error) throw error

    // Pull the ad_date from the first row — all rows in v_current_week_deals
    // for a given store share the same ad_date (it's the latest ad)
    const adDate = (data ?? [])[0]?.ad_date ?? null

    return NextResponse.json(
      { deals: data ?? [], total: count ?? 0, ad_date: adDate, store },
      { headers: { "Cache-Control": CACHE } }
    )
  } catch (err) {
    console.error("[/api/deals]", err)
    return NextResponse.json({ error: "Failed to load deals" }, { status: 500 })
  }
}
