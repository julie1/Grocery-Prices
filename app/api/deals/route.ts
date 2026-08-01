// app/api/deals/route.ts
// =============================================================================
// GET /api/deals
// =============================================================================
//
// Query params:
//   store     — required. e.g. "Safeway"
//   category  — optional filter by category name, e.g. "Chicken"
//   date      — optional. "YYYY-MM-DD". Picks that store's ad for that exact
//               date instead of the most recent one. Use /api/ad-dates to
//               get the list of valid dates for a store.
//   limit     — default 60, max 200
//   offset    — default 0
//
// Returns: { deals: DealRow[], total: number, ad_date: string|null, store: string }
//
// Powers the per-store "browse this week's circular" tab view.
// Returns all price rows from the store's most recent ad (or the ad on
// `date`, if given), joined to category names. Rows without a category_id
// are included (category_name will be null).
//
// Results sorted by category_name then sale_price.
// =============================================================================

import { NextRequest, NextResponse } from "next/server"
import { createServerClient }        from "@/lib/supabase"

const CACHE = "public, s-maxage=300, stale-while-revalidate=3600"

export async function GET(request: NextRequest) {
  const sp       = request.nextUrl.searchParams
  const store    = sp.get("store")?.trim()    ?? ""
  const category = sp.get("category")?.trim() ?? ""
  const date     = sp.get("date")?.trim()     ?? ""
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
    // Step 1: find the most recent ad_id for this store
    const { data: storeRow, error: storeErr } = await sb
      .from("stores")
      .select("id")
      .ilike("name", store)
      .single()

    if (storeErr || !storeRow) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    let adQuery = sb
      .from("ads")
      .select("id, ad_date")
      .eq("store_id", storeRow.id)

    adQuery = date
      ? adQuery.eq("ad_date", date)
      : adQuery.order("ad_date", { ascending: false })

    const { data: latestAd, error: adErr } = await adQuery.limit(1).single()

    if (adErr || !latestAd) {
      return NextResponse.json(
        { deals: [], total: 0, ad_date: null, store },
        { headers: { "Cache-Control": CACHE } }
      )
    }

    // Step 2: fetch price rows for that ad, joined to categories
    let query = sb
      .from("prices")
      .select(
        "id, raw_product_name, sale_price, price_per_unit, unit_size, " +
        "special_conditions, bundle_quantity, bundle_price, category_id, " +
        "categories(name)",
        { count: "exact" }
      )
      .eq("ad_id", latestAd.id)
      .order("categories(name)", { ascending: true,  nullsFirst: false })
      .order("sale_price",       { ascending: true })
      .range(offset, offset + limit - 1)

    if (category) {
      // Filter via the joined category name
      const { data: catRow } = await sb
        .from("categories")
        .select("id")
        .ilike("name", category)
        .single()
      if (catRow) {
        query = query.eq("category_id", catRow.id)
      }
    }

    const { data, error, count } = await query
    if (error) throw error

    // Flatten category join for convenience
    const deals = (data ?? []).map((row: any) => ({
      ...row,
      category_name: row.categories?.name ?? null,
      categories: undefined,
    }))

    return NextResponse.json(
      { deals, total: count ?? 0, ad_date: latestAd.ad_date, store },
      { headers: { "Cache-Control": CACHE } }
    )
  } catch (err) {
    console.error("[/api/deals]", err)
    return NextResponse.json({ error: "Failed to load deals" }, { status: 500 })
  }
}
