// app/api/search/route.ts
// =============================================================================
// GET /api/search
// =============================================================================
//
// Query params:
//   q         — search term, e.g. "chicken breast"  (optional)
//   store     — filter by store name, e.g. "Safeway"  (optional)
//   category  — filter by category name, e.g. "Chicken"  (optional)
//   weeks     — how many weeks back to search, default 4, max 52
//   limit     — max results, default 30, max 100
//   offset    — pagination offset, default 0
//
// Returns: { results: SearchResult[], total: number }
//
// Searches raw_product_name using ILIKE — no canonical products, no LLM.
// Each row is a distinct price entry from the prices table, joined to store
// and category info. Results are sorted by ad_date DESC then sale_price ASC
// so the most recent deals appear first.
//
// The `weeks` param bounds the search window — default 4 weeks covers the
// current and previous circular for each store.
// =============================================================================

import { NextRequest, NextResponse } from "next/server"
import { createServerClient }        from "@/lib/supabase"

const CACHE = "public, s-maxage=300, stale-while-revalidate=3600"

export async function GET(request: NextRequest) {
  const sp       = request.nextUrl.searchParams
  const q        = sp.get("q")?.trim()        ?? ""
  const store    = sp.get("store")?.trim()    ?? ""
  const category = sp.get("category")?.trim() ?? ""
  const weeks    = Math.min(parseInt(sp.get("weeks")  ?? "4",  10), 52)
  const limit    = Math.min(parseInt(sp.get("limit")  ?? "30", 10), 100)
  const offset   = Math.max(parseInt(sp.get("offset") ?? "0",  10), 0)

  const sb = createServerClient()

  try {
    // Cutoff date
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - weeks * 7)
    const cutoffStr = cutoff.toISOString().split("T")[0]

    // Resolve optional store filter to store_id
    let storeId: number | null = null
    if (store) {
      const { data: storeRow } = await sb
        .from("stores")
        .select("id")
        .ilike("name", store)
        .single()
      if (!storeRow) {
        return NextResponse.json(
          { results: [], total: 0 },
          { headers: { "Cache-Control": CACHE } }
        )
      }
      storeId = storeRow.id
    }

    // Resolve optional category filter to category_id
    let categoryId: number | null = null
    if (category) {
      const { data: catRow } = await sb
        .from("categories")
        .select("id")
        .ilike("name", category)
        .single()
      if (catRow) categoryId = catRow.id
    }

    // Main query — prices joined to ads, stores, categories
    let query = sb
      .from("prices")
      .select(
        "id, raw_product_name, sale_price, price_per_unit, unit_size, " +
        "special_conditions, bundle_quantity, bundle_price, category_id, " +
        "categories(name), " +
        "ads!inner(ad_date, store_id, stores!inner(id, name, location))",
        { count: "exact" }
      )
      .gte("ads.ad_date", cutoffStr)
      .order("ad_date", { ascending: true, foreignTable: "ads" })
      .order("sale_price",  { ascending: true  })
      .range(offset, offset + limit - 1)

    if (q) {
      query = query.ilike("raw_product_name", `%${q}%`)
    }

    if (storeId !== null) {
      query = query.eq("ads.store_id", storeId)
    }

    if (categoryId !== null) {
      query = query.eq("category_id", categoryId)
    }

    const { data, error, count } = await query
    if (error) throw error

    // Flatten nested joins
    const results = (data ?? []).map((row: any) => ({
      id:                  row.id,
      raw_product_name:    row.raw_product_name,
      sale_price:          row.sale_price,
      price_per_unit:      row.price_per_unit,
      unit_size:           row.unit_size,
      special_conditions:  row.special_conditions,
      bundle_quantity:     row.bundle_quantity,
      bundle_price:        row.bundle_price,
      category_id:         row.category_id,
      category_name:       row.categories?.name ?? null,
      ad_date:             row.ads?.ad_date ?? null,
      store_id:            row.ads?.stores?.id ?? null,
      store_name:          row.ads?.stores?.name ?? null,
      store_location:      row.ads?.stores?.location ?? null,
    }))

    return NextResponse.json(
      { results, total: count ?? 0 },
      { headers: { "Cache-Control": CACHE } }
    )
  } catch (err) {
    console.error("[/api/search]", err)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
