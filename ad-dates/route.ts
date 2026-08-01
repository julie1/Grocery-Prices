// app/api/ad-dates/route.ts
// =============================================================================
// GET /api/ad-dates
// =============================================================================
//
// Query params:
//   store — required. e.g. "Safeway"
//
// Returns: { store: string, dates: string[] }
//
// `dates` is every ad_date this store has an ad for, most recent first.
// Powers the date picker dropdown on the Browse page — the frontend fetches
// this once per store selection, then lets the user pick any prior week's
// circular via /api/deals?store=X&date=Y.
//
// Cached for 10 minutes — new ad dates only show up roughly weekly.
// =============================================================================

import { NextRequest, NextResponse } from "next/server"
import { createServerClient }        from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const store = request.nextUrl.searchParams.get("store")?.trim() ?? ""

  if (!store) {
    return NextResponse.json({ error: "store parameter is required" }, { status: 400 })
  }

  const sb = createServerClient()

  try {
    const { data: storeRow, error: storeErr } = await sb
      .from("stores")
      .select("id")
      .ilike("name", store)
      .single()

    if (storeErr || !storeRow) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    const { data, error } = await sb
      .from("ads")
      .select("ad_date")
      .eq("store_id", storeRow.id)
      .order("ad_date", { ascending: false })

    if (error) throw error

    const dates = Array.from(new Set((data ?? []).map((r: any) => r.ad_date)))

    return NextResponse.json(
      { store, dates },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    )
  } catch (err) {
    console.error("[/api/ad-dates]", err)
    return NextResponse.json({ error: "Failed to load ad dates" }, { status: 500 })
  }
}
