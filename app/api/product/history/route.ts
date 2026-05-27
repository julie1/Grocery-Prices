// app/api/product/[id]/history/route.ts
// =============================================================================
// GET /api/product/[id]/history
// =============================================================================
//
// Query params:
//   weeks  — how many weeks back to return, default 12, max 52
//
// Returns: { history: PriceHistoryPoint[] }
//
// Flat rows of (ad_date, store_name, sale_price, price_per_unit, ...).
// The frontend reshapes these into recharts format:
//   [{ date: "Apr 1", Safeway: 4.99, Yokes: 5.29 }, ...]
// using the reshapeHistory() helper in page.tsx.
//
// Why return flat rows instead of pre-shaped chart data?
//   • Flat rows are cacheable, reusable, and easier to test
//   • The reshape is ~10 lines of JS, cheaper than doing it server-side
//   • The frontend might want the raw data for a table view too
//
// Why v_price_history instead of prices directly?
//   v_price_history already filters out unnormalized rows and joins stores/ads,
//   so the route is a simple filtered SELECT rather than a multi-table JOIN.
// =============================================================================

import { NextRequest, NextResponse } from "next/server"
import { createServerClient }        from "@/lib/supabase"

const CACHE = "public, s-maxage=300, stale-while-revalidate=3600"

export async function GET(
    request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
  ) {
  const { id } = await params
  const id    = parseInt(id, 10)
  const weeks = Math.min(
    parseInt(request.nextUrl.searchParams.get("weeks") ?? "12", 10),
    52
  )

  if (isNaN(id) || id < 1) {
    return NextResponse.json({ error: "Invalid product id" }, { status: 400 })
  }

  // Cutoff date string "YYYY-MM-DD"
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - weeks * 7)
  const cutoffStr = cutoff.toISOString().split("T")[0]

  const sb = createServerClient()

  try {
    const { data, error } = await sb
      .from("v_price_history")
      .select(
        "ad_date, store_name, store_id, sale_price, price_per_unit, " +
        "unit_size, special_conditions"
      )
      .eq("canonical_product_id", id)
      .gte("ad_date", cutoffStr)
      .order("ad_date",    { ascending: true })
      .order("store_name", { ascending: true })

    if (error) throw error

    return NextResponse.json(
      { history: data ?? [] },
      { headers: { "Cache-Control": CACHE } }
    )
  } catch (err) {
    console.error(`[/api/product/${id}/history]`, err)
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 })
  }
}
