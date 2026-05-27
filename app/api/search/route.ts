// app/api/search/route.ts
// =============================================================================
// GET /api/search
// =============================================================================
//
// Query params:
//   q         — search term, e.g. "chicken breast"  (optional)
//   category  — filter by category name, e.g. "poultry"  (optional)
//   store     — only products on sale at this store this week  (optional)
//   limit     — max results, default 30, max 100
//   offset    — pagination offset, default 0
//
// Returns: { products: SearchProduct[], total: number }
//
// Two modes:
//   With q:    full-text search via Postgres plainto_tsquery() + GIN index.
//              Handles stemming ("chickens" → "chicken"), faster than ILIKE.
//   Without q: browse mode — returns all products, sorted by stores_this_week
//              then lowest_price.  Good for category browsing.
//
// Store filter design:
//   v_search_products aggregates across all stores, so it has no store_name
//   column to filter on directly.  When ?store= is supplied we do a quick
//   pre-query on v_current_week_deals to get the canonical_product_ids
//   currently on sale at that store, then filter the main query to those ids.
//   Two queries instead of one, but each is simple and fast.
//
// Caching:
//   s-maxage=300 (5 min CDN cache) + stale-while-revalidate=3600 (serve stale
//   for up to an hour while Vercel refreshes in background).  Weekly ad data
//   doesn't change mid-day so this is very safe.
// =============================================================================

import { NextRequest, NextResponse } from "next/server"
import { createServerClient }        from "@/lib/supabase"

const CACHE = "public, s-maxage=300, stale-while-revalidate=3600"

export async function GET(request: NextRequest) {
  const sp       = request.nextUrl.searchParams
  const q        = sp.get("q")?.trim()        ?? ""
  const category = sp.get("category")?.trim() ?? ""
  const store    = sp.get("store")?.trim()    ?? ""
  const limit    = Math.min(parseInt(sp.get("limit")  ?? "30", 10), 100)
  const offset   = Math.max(parseInt(sp.get("offset") ?? "0",  10), 0)

  const sb = createServerClient()

  try {
    // Step 1 (conditional): resolve store filter to a list of product ids
    let allowedIds: number[] | null = null
    if (store) {
      const { data: dealRows, error: dealErr } = await sb
        .from("v_current_week_deals")
        .select("canonical_product_id")
        .ilike("store_name", store)
        .not("canonical_product_id", "is", null)

      if (dealErr) throw dealErr

      allowedIds = (dealRows ?? [])
        .map((r: { canonical_product_id: number | null }) => r.canonical_product_id)
        .filter((id): id is number => id !== null)

      // Store exists but nothing on sale this week — return empty early
      if (allowedIds.length === 0) {
        return NextResponse.json(
          { products: [], total: 0 },
          { headers: { "Cache-Control": CACHE } }
        )
      }
    }

    // Step 2: main search query against v_search_products
    let query = sb
      .from("v_search_products")
      .select("*", { count: "exact" })

    // Full-text search — uses the GIN index on canonical_products
    if (q) {
      query = query.textSearch("product_name", q, {
        type:   "plain",
        config: "english",
      })
    }

    if (category) {
      query = query.ilike("category_name", category)
    }

    if (allowedIds !== null) {
      query = query.in("canonical_product_id", allowedIds)
    }

    // Sort: most stores carrying it first (most "deal-worthy"), then cheapest
    query = query
      .order("stores_this_week", { ascending: false })
      .order("lowest_price",     { ascending: true  })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) throw error

    return NextResponse.json(
      { products: data ?? [], total: count ?? 0 },
      { headers: { "Cache-Control": CACHE } }
    )
  } catch (err) {
    console.error("[/api/search]", err)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
