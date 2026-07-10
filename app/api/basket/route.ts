// app/api/basket/route.ts
// =============================================================================
// GET /api/basket
// =============================================================================
//
// Query params:
//   weeks  — how many weeks back, default 12, max 52
//
// Returns: { basket: BasketWeek[], stores: string[] }
//
// Each BasketWeek is:
//   {
//     ad_date: string,
//     Yokes: number | null,
//     Rosauers: number | null,
//     Safeway: number | null,
//     "Fred Meyer": number | null,
//   }
//
// Powers the basket cost comparison chart. For each week, computes the total
// cost of the 25-item inflation basket at each store based on sale prices
// from that week's ad. If a basket item wasn't on sale that week at a store,
// that store's contribution for that item is null (not interpolated here —
// interpolation can be done in the frontend or a future enhancement).
//
// Matching logic: for each basket_item, find prices rows where:
//   - ad.store_id matches basket_item.store_id
//   - raw_product_name ILIKE any of basket_item.match_keywords (joined with OR)
//   - raw_product_name does NOT contain any exclude_keywords
// Then take the lowest sale_price for that item+store+week.
// =============================================================================

import { NextRequest, NextResponse } from "next/server"
import { createServerClient }        from "@/lib/supabase"

const CACHE = "public, s-maxage=300, stale-while-revalidate=3600"

// Store names in display order
const STORE_NAMES = ["Yokes", "Rosauers", "Safeway", "Fred Meyer"]

export async function GET(request: NextRequest) {
  const weeks = Math.min(
    parseInt(request.nextUrl.searchParams.get("weeks") ?? "12", 10),
    52
  )

  const sb = createServerClient()

  try {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - weeks * 7)
    const cutoffStr = cutoff.toISOString().split("T")[0]

    // Fetch all basket items
    const { data: basketItems, error: basketErr } = await sb
      .from("basket_items")
      .select("id, name, store_id, match_keywords, exclude_keywords")
      .eq("is_active", true)

    if (basketErr) throw basketErr

    // Fetch all stores to build id→name map
    const { data: stores, error: storesErr } = await sb
      .from("stores")
      .select("id, name")

    if (storesErr) throw storesErr

    const storeIdToName = Object.fromEntries(
      (stores ?? []).map((s: any) => [s.id, s.name])
    )

    // Fetch all ads in the window with their store
    const { data: ads, error: adsErr } = await sb
      .from("ads")
      .select("id, ad_date, store_id")
      .gte("ad_date", cutoffStr)
      .order("ad_date", { ascending: true })

    if (adsErr) throw adsErr

    // Build a map of ad_id → { ad_date, store_id }
    const adMap = new Map<number, { ad_date: string; store_id: number }>()
    for (const ad of ads ?? []) {
      adMap.set(ad.id, { ad_date: ad.ad_date, store_id: ad.store_id })
    }

    const adIds = Array.from(adMap.keys())
    if (adIds.length === 0) {
      return NextResponse.json(
        { basket: [], stores: STORE_NAMES },
        { headers: { "Cache-Control": CACHE } }
      )
    }

    // Fetch all price rows for these ads
    const { data: prices, error: pricesErr } = await sb
      .from("prices")
      .select("id, ad_id, raw_product_name, sale_price")
      .in("ad_id", adIds)

    if (pricesErr) throw pricesErr

    // For each basket item + ad week, find the best matching price
    // Structure: weeklyTotals[ad_date][store_name] = { total, matched_items }
    const weeklyTotals = new Map<string, Map<string, { total: number; count: number }>>()

    for (const item of basketItems ?? []) {
      const storeName = storeIdToName[item.store_id]
      if (!storeName) continue

      const keywords: string[]  = item.match_keywords ?? []
      const excludes: string[]  = item.exclude_keywords ?? []

      // Find matching prices for this basket item across all weeks
      const matchingPrices = (prices ?? []).filter((p: any) => {
        const ad = adMap.get(p.ad_id)
        if (!ad || ad.store_id !== item.store_id) return false
        const name = (p.raw_product_name ?? "").toLowerCase()
        if (excludes.some((ex: string) => name.includes(ex.toLowerCase()))) return false
        return keywords.some((kw: string) => name.includes(kw.toLowerCase()))
      })

      // Group by ad_date and take min price per week
      const byWeek = new Map<string, number>()
      for (const p of matchingPrices) {
        const ad = adMap.get(p.ad_id)!
        const existing = byWeek.get(ad.ad_date)
        if (existing === undefined || p.sale_price < existing) {
          byWeek.set(ad.ad_date, p.sale_price)
        }
      }

      // Accumulate into weeklyTotals
      for (const [ad_date, price] of byWeek.entries()) {
        if (!weeklyTotals.has(ad_date)) weeklyTotals.set(ad_date, new Map())
        const storeMap = weeklyTotals.get(ad_date)!
        if (!storeMap.has(storeName)) storeMap.set(storeName, { total: 0, count: 0 })
        const entry = storeMap.get(storeName)!
        entry.total += price
        entry.count += 1
      }
    }

    // Build output: one row per week, one column per store
    const allDates = Array.from(
      new Set((ads ?? []).map((a: any) => a.ad_date))
    ).sort()

    const basket = allDates.map((ad_date) => {
      const storeMap = weeklyTotals.get(ad_date)
      const row: Record<string, any> = { ad_date }
      for (const name of STORE_NAMES) {
        const entry = storeMap?.get(name)
        // Only include total if at least half the basket items matched
        row[name] = entry && entry.count >= 10
          ? Math.round(entry.total * 100) / 100
          : null
      }
      return row
    })

    return NextResponse.json(
      { basket, stores: STORE_NAMES },
      { headers: { "Cache-Control": CACHE } }
    )
  } catch (err) {
    console.error("[/api/basket]", err)
    return NextResponse.json({ error: "Failed to load basket" }, { status: 500 })
  }
}
