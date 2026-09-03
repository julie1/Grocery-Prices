// app/api/basket/route.ts
// =============================================================================
// GET /api/basket
// =============================================================================
//
// Query params:
//   weeks  — how many weeks back, default 12, max 52
//   debug  — "1" to return diagnostics instead of the normal basket response.
//            Without &item=..., returns an all-items overview across every
//            week in the `weeks` window: { weeks: [{ ad_date, itemDiagnostics }] }.
//            With &item=Milk (basket_item name, case-insensitive), returns
//            that one item's match diagnostics across every week instead:
//            { item, weeks: [{ ad_date, stores }] }.
//            Use either to check whether an item is just absent from a given
//            week's ad vs. a genuine matching problem. sample_raw_names_no_match
//            is a sample of raw product names for that store/week that did NOT
//            match this item's keywords — useful for spotting a keyword that's
//            too narrow (or an exclude that's too broad).
//
// Returns: { basket: BasketWeek[], stores: string[] }
//
// Each BasketWeek is:
//   {
//     ad_date: string,
//     Yokes: BasketCell | null,
//     Rosauers: BasketCell | null,
//     Safeway: BasketCell | null,
//     "Fred Meyer": BasketCell | null,
//   }
// where BasketCell is:
//   {
//     total: number,          // summed sale price across matched items
//     matched_count: number,  // how many active basket items matched this week
//     total_items: number,    // how many active basket items exist for this store
//     coverage: number,       // matched_count / total_items, 0-1
//     confidence: "high" | "medium" | "low",  // coverage >= .8 / >= .5 / below
//   }
//
// Powers the basket cost comparison chart. For each week, computes the total
// cost of the active inflation basket at each store based on sale prices
// from that week's ad. A cell is null only when fewer than 3 items matched
// (too noisy to represent a basket at all). Otherwise the total is always
// returned along with matched/total counts and a confidence tier, so partial
// weeks are shown (with a visual indicator) instead of being hidden.
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

// Supabase/PostgREST caps a single .select() at a default row limit
// (commonly 1000) unless you paginate with .range(). For a period with
// many weeks of ads/prices this table can easily exceed that in one
// query, and since rows are typically returned in insertion order, the
// truncated tail is the MOST RECENT data — exactly the weeks you'd
// notice missing first. This helper pages through with .range() until a
// page comes back short, so no data is silently dropped.
async function fetchAllRows<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await queryPage(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

export async function GET(request: NextRequest) {
  const weeks = Math.min(
    parseInt(request.nextUrl.searchParams.get("weeks") ?? "12", 10),
    52
  )
  const debug = request.nextUrl.searchParams.get("debug") === "1"

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

    // Total active basket items per store — the denominator for coverage %.
    // Computed from basketItems directly rather than a hardcoded "25", since
    // different stores can have different numbers of active items.
    const totalItemsByStore = new Map<string, number>()
    for (const item of basketItems ?? []) {
      const storeName = storeIdToName[item.store_id]
      if (!storeName) continue
      totalItemsByStore.set(storeName, (totalItemsByStore.get(storeName) ?? 0) + 1)
    }

    // Fetch all ads in the window with their store.
    // Ordered by id (stable, insertion order) as well as date so pagination
    // is deterministic across pages even when many ads share a date.
    const ads = await fetchAllRows((from, to) =>
      sb.from("ads")
        .select("id, ad_date, store_id")
        .gte("ad_date", cutoffStr)
        .order("ad_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    )

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

    // Fetch all price rows for these ads — paginated, since this table
    // is the one most likely to blow past the default row cap (a single
    // store/week can be 100+ rows on its own; across many weeks this is
    // easily 10,000+).
    const prices = await fetchAllRows((from, to) =>
      sb.from("prices")
        .select("id, ad_id, raw_product_name, sale_price")
        .in("ad_id", adIds)
        .order("id", { ascending: true })
        .range(from, to)
    )

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

    if (debug) {
      const itemFilter = request.nextUrl.searchParams.get("item")

      if (itemFilter) {
        // Multi-week view for one basket item — lets you check whether an
        // item shows up most weeks or was genuinely absent from the ad,
        // instead of only ever seeing the single latest week.
        const matchingItems = (basketItems ?? []).filter(
          (item: any) => item.name.toLowerCase() === itemFilter.toLowerCase()
        )

        const adsByDateAndStore = new Map<string, Map<number, number[]>>() // ad_date -> store_id -> ad_ids
        for (const ad of ads ?? []) {
          if (!adsByDateAndStore.has(ad.ad_date)) adsByDateAndStore.set(ad.ad_date, new Map())
          const storeMap = adsByDateAndStore.get(ad.ad_date)!
          const list = storeMap.get(ad.store_id) ?? []
          list.push(ad.id)
          storeMap.set(ad.store_id, list)
        }

        const weeksOut = allDates.map((ad_date) => {
          const storeMap = adsByDateAndStore.get(ad_date) ?? new Map()
          const stores: Record<string, any> = {}
          for (const item of matchingItems) {
            const storeName = storeIdToName[item.store_id] ?? `store_id ${item.store_id}`
            const adIdsThisWeek = storeMap.get(item.store_id) ?? []
            const pricesThisStoreWeek = (prices ?? []).filter((p: any) =>
              adIdsThisWeek.includes(p.ad_id)
            )
            const keywords: string[] = item.match_keywords ?? []
            const excludes: string[] = item.exclude_keywords ?? []
            const matches = pricesThisStoreWeek.filter((p: any) => {
              const name = (p.raw_product_name ?? "").toLowerCase()
              if (excludes.some((ex: string) => name.includes(ex.toLowerCase()))) return false
              return keywords.some((kw: string) => name.includes(kw.toLowerCase()))
            })
            stores[storeName] = {
              total_prices_that_store_that_week: pricesThisStoreWeek.length,
              matched_count: matches.length,
              matched_names: matches.map((p: any) => p.raw_product_name),
            }
          }
          return { ad_date, stores }
        })

        return NextResponse.json(
          { item: itemFilter, weeks: weeksOut },
          { headers: { "Cache-Control": "no-store" } }
        )
      }

      // No item filter — diagnostics across every week in the `weeks`
      // window (previously only the single latest week, unlike
      // /api/categories?debug=1 which already covered several weeks).
      const adsByDateAndStoreAll = new Map<string, Map<number, number[]>>()
      for (const ad of ads ?? []) {
        if (!adsByDateAndStoreAll.has(ad.ad_date)) adsByDateAndStoreAll.set(ad.ad_date, new Map())
        const storeMap = adsByDateAndStoreAll.get(ad.ad_date)!
        const list = storeMap.get(ad.store_id) ?? []
        list.push(ad.id)
        storeMap.set(ad.store_id, list)
      }

      const weeksOut = allDates.map((ad_date) => {
        const storeMap = adsByDateAndStoreAll.get(ad_date) ?? new Map()
        const itemDiagnostics = (basketItems ?? []).map((item: any) => {
          const storeName = storeIdToName[item.store_id] ?? `store_id ${item.store_id}`
          const adIdsThisWeek = storeMap.get(item.store_id) ?? []
          const pricesThisStoreWeek = (prices ?? []).filter((p: any) =>
            adIdsThisWeek.includes(p.ad_id)
          )
          const keywords: string[] = item.match_keywords ?? []
          const excludes: string[] = item.exclude_keywords ?? []
          const matches = pricesThisStoreWeek.filter((p: any) => {
            const name = (p.raw_product_name ?? "").toLowerCase()
            if (excludes.some((ex: string) => name.includes(ex.toLowerCase()))) return false
            return keywords.some((kw: string) => name.includes(kw.toLowerCase()))
          })
          // Bugfix: this used to be pricesThisStoreWeek.slice(0, 8) — a
          // generic sample that included matches, not actual non-matches.
          // Exclude the matched rows (by reference — matches is a filtered
          // subset of the same array) before sampling.
          const nonMatches = pricesThisStoreWeek.filter((p: any) => !matches.includes(p))
          return {
            basket_item: item.name,
            store: storeName,
            keywords,
            excludes,
            total_prices_that_store_that_week: pricesThisStoreWeek.length,
            matched_count: matches.length,
            sample_raw_names_no_match: nonMatches.slice(0, 8).map((p: any) => p.raw_product_name),
          }
        })
        return { ad_date, itemDiagnostics }
      })

      return NextResponse.json(
        { weeks: weeksOut },
        { headers: { "Cache-Control": "no-store" } }
      )
      
    }

    const basket = allDates.map((ad_date) => {
      const storeMap = weeklyTotals.get(ad_date)
      const row: Record<string, any> = { ad_date }
      for (const name of STORE_NAMES) {
        const entry = storeMap?.get(name)
        const totalItems = totalItemsByStore.get(name) ?? 0
        const matchedCount = entry?.count ?? 0
        const coverage = totalItems > 0 ? matchedCount / totalItems : 0

        // Floor: below 3 matched items, a "total" is too noisy to be
        // meaningful (one or two sale prices don't represent a basket).
        // Above that floor we always return the total — no more hard
        // cutoff — plus enough info for the frontend to show a confidence
        // indicator instead of silently hiding the week.
        if (matchedCount < 3) {
          row[name] = null
          continue
        }

        const confidence: "high" | "medium" | "low" =
          coverage >= 0.8 ? "high" : coverage >= 0.5 ? "medium" : "low"

        row[name] = {
          total: Math.round((entry!.total) * 100) / 100,
          matched_count: matchedCount,
          total_items: totalItems,
          coverage: Math.round(coverage * 100) / 100,
          confidence,
        }
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
