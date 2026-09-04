// app/api/categories/route.ts
// =============================================================================
// GET /api/categories
// =============================================================================
//
// Query params:
//   store     — required. e.g. "Safeway"
//   category  — required. e.g. "Chicken"
//   weeks     — how many weeks back, default 12, max 52
//   debug     — "1" to return per-week matched/unmatched raw product names
//               instead of the normal trend response — same pattern as
//               /api/basket?debug=1, for checking whether a keyword filter
//               is matching what you'd expect.
//
// Returns: { trend: TrendPoint[], category: string, store: string, filtered: boolean }
//
// Each TrendPoint is:
//   { ad_date: string, avg_price: number, min_price: number, count: number }
//
// Powers the category trend graphs on the frontend. Returns one row per
// ad week for the given store+category combination.
//
// If category_trend_filters has an active row for this category, avg_price/
// min_price are computed only over price rows whose raw_product_name matches
// that filter's match_keywords (and none of its exclude_keywords) — e.g. for
// "Milk", only actual milk products count, not the whole aisle's worth of
// unrelated dairy-adjacent items. A week with several matches is averaged;
// exactly one match just uses that price. `filtered: true` in the response
// indicates this happened; `count` per point tells you how many products
// contributed to that week.
//
// If no active filter row exists for the category, this falls back to the
// original behavior: avg_price/min_price across every item in the category,
// unfiltered. `filtered: false` in that case.
// =============================================================================

import { NextRequest, NextResponse } from "next/server"
import { createServerClient }        from "@/lib/supabase"

const CACHE = "public, s-maxage=300, stale-while-revalidate=3600"

// remove the local function, add this import near the top:
import { matchesFilter } from "@/lib/trendFilterMatch"


export async function GET(request: NextRequest) {
  const sp       = request.nextUrl.searchParams
  const store    = sp.get("store")?.trim()    ?? ""
  const category = sp.get("category")?.trim() ?? ""
  const weeks    = Math.min(parseInt(sp.get("weeks") ?? "12", 10), 52)
  const debug    = sp.get("debug") === "1"

  if (!store) {
    return NextResponse.json({ error: "store parameter is required" }, { status: 400 })
  }
  if (!category) {
    return NextResponse.json({ error: "category parameter is required" }, { status: 400 })
  }

  const sb = createServerClient()

  try {
    // Resolve store
    const { data: storeRow, error: storeErr } = await sb
      .from("stores")
      .select("id")
      .ilike("name", store)
      .single()

    if (storeErr || !storeRow) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    // Resolve category
    const { data: catRow, error: catErr } = await sb
      .from("categories")
      .select("id")
      .ilike("name", category)
      .single()

    if (catErr || !catRow) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }

    // Look up this category's representative-product filter, if one exists.
    const { data: filterRow } = await sb
      .from("category_trend_filters")
      .select("match_keywords, exclude_keywords, is_active")
      .eq("category_id", catRow.id)
      .maybeSingle()

    const activeFilter =
      filterRow?.is_active && (filterRow.match_keywords?.length ?? 0) > 0
        ? { keywords: filterRow.match_keywords as string[], excludes: (filterRow.exclude_keywords ?? []) as string[] }
        : null

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - weeks * 7)
    const cutoffStr = cutoff.toISOString().split("T")[0]

    // Fetch all matching price rows with ad_date. raw_product_name is only
    // needed when a filter is active, but it's cheap to always select.
    const { data, error } = await sb
      .from("prices")
      .select("sale_price, raw_product_name, ads!inner(ad_date, store_id)")
      .eq("category_id", catRow.id)
      .eq("ads.store_id", storeRow.id)
      .gte("ads.ad_date", cutoffStr)
      .order("ad_date", { ascending: true, foreignTable: "ads" })


    if (error) throw error

    const rows = (data ?? []).filter((row: any) =>
      !activeFilter || matchesFilter(row.raw_product_name ?? "", activeFilter.keywords, activeFilter.excludes)
    )

    if (debug) {
      const byDateDebug = new Map<string, any[]>()
      for (const row of data ?? []) {
        const date = (row as any).ads?.ad_date
        if (!date) continue
        if (!byDateDebug.has(date)) byDateDebug.set(date, [])
        byDateDebug.get(date)!.push(row)
      }
      const weeksOut = Array.from(byDateDebug.entries()).map(([ad_date, weekRows]) => ({
        ad_date,
        matched:   weekRows.filter((r: any) => !activeFilter || matchesFilter(r.raw_product_name ?? "", activeFilter.keywords, activeFilter.excludes)).map((r: any) => r.raw_product_name),
        unmatched: activeFilter ? weekRows.filter((r: any) => !matchesFilter(r.raw_product_name ?? "", activeFilter.keywords, activeFilter.excludes)).map((r: any) => r.raw_product_name) : [],
      }))
      return NextResponse.json(
        { category, store, filtered: !!activeFilter, filter: activeFilter, weeks: weeksOut },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    // Aggregate by ad_date in JS — group rows by week
    const byDate = new Map<string, number[]>()
    for (const row of rows) {
      const date = (row as any).ads?.ad_date
      if (!date) continue
      if (!byDate.has(date)) byDate.set(date, [])
      byDate.get(date)!.push(row.sale_price)
    }

    const trend = Array.from(byDate.entries()).map(([ad_date, prices]) => ({
      ad_date,
      avg_price: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
      min_price: Math.min(...prices),
      count:     prices.length,
    }))

    return NextResponse.json(
      { trend, category, store, filtered: !!activeFilter },
      { headers: { "Cache-Control": CACHE } }
    )
  } catch (err) {
    console.error("[/api/categories]", err)
    return NextResponse.json({ error: "Failed to load category trend" }, { status: 500 })
  }
}
