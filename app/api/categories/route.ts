// app/api/categories/route.ts
// =============================================================================
// GET /api/categories
// =============================================================================
//
// Query params:
//   store     — required. e.g. "Safeway"
//   category  — required. e.g. "Chicken"
//   weeks     — how many weeks back, default 12, max 52
//
// Returns: { trend: TrendPoint[], category: string, store: string }
//
// Each TrendPoint is:
//   { ad_date: string, avg_price: number, min_price: number, count: number }
//
// Powers the category trend graphs on the frontend. Returns one row per
// ad week for the given store+category combination. The frontend uses these
// to draw a line chart showing how prices in a category have changed over time.
//
// avg_price and min_price are computed across all items in that category
// for that store's ad that week — useful for showing both the typical
// price level and the best available deal.
// =============================================================================

import { NextRequest, NextResponse } from "next/server"
import { createServerClient }        from "@/lib/supabase"

const CACHE = "public, s-maxage=300, stale-while-revalidate=3600"

export async function GET(request: NextRequest) {
  const sp       = request.nextUrl.searchParams
  const store    = sp.get("store")?.trim()    ?? ""
  const category = sp.get("category")?.trim() ?? ""
  const weeks    = Math.min(parseInt(sp.get("weeks") ?? "12", 10), 52)

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

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - weeks * 7)
    const cutoffStr = cutoff.toISOString().split("T")[0]

    // Fetch all matching price rows with ad_date
    const { data, error } = await sb
      .from("prices")
      .select("sale_price, ads!inner(ad_date, store_id)")
      .eq("category_id", catRow.id)
      .eq("ads.store_id", storeRow.id)
      .gte("ads.ad_date", cutoffStr)
      .order("ads.ad_date", { ascending: true })

    if (error) throw error

    // Aggregate by ad_date in JS — group rows by week
    const byDate = new Map<string, number[]>()
    for (const row of data ?? []) {
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
      { trend, category, store },
      { headers: { "Cache-Control": CACHE } }
    )
  } catch (err) {
    console.error("[/api/categories]", err)
    return NextResponse.json({ error: "Failed to load category trend" }, { status: 500 })
  }
}
