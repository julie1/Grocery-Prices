// app/api/product/[id]/route.ts
// =============================================================================
// GET /api/product/[id]
// =============================================================================
//
// Returns a canonical product + its current price at each store.
//
// Response:
// {
//   product: { id, product_name, brand, unit_size, category_id,
//              categories: { name, standard_unit } },
//   current_prices: [
//     { store_name, sale_price, price_per_unit, unit_size,
//       special_conditions, ad_date, ... },
//     ...
//   ]
// }
//
// "Current" = most recent ad per store (from v_current_week_deals), not
// necessarily this calendar week.  Using the most recent available is correct
// behaviour — a store that didn't publish this week still has a price.
//
// The Supabase client doesn't support DISTINCT ON, so we fetch up to 40 rows
// (4 stores × 10 recent weeks of overlap) sorted by ad_date DESC and dedupe
// to one-per-store in JavaScript.  At this scale (4 stores) this is simpler
// and equally fast compared to a raw SQL RPC.
// =============================================================================

import { NextRequest, NextResponse } from "next/server"
import { createServerClient }        from "@/lib/supabase"

const CACHE = "public, s-maxage=300, stale-while-revalidate=3600"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const id = parseInt(id, 10)
  if (isNaN(id) || id < 1) {
    return NextResponse.json({ error: "Invalid product id" }, { status: 400 })
  }

  const sb = createServerClient()

  try {
    // 1. Canonical product with its category (one extra select, avoids a join)
    const { data: product, error: productErr } = await sb
      .from("canonical_products")
      .select("*, categories(name, standard_unit)")
      .eq("id", id)
      .single()

    if (productErr || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    // 2. Current prices — most recent ad per store
    //    Fetch from v_current_week_deals (already filtered to latest ad per store)
    //    so we get exactly one row per store that carries this product.
    const { data: prices, error: pricesErr } = await sb
      .from("v_current_week_deals")
      .select(
        "store_id, store_name, store_location, sale_price, price_per_unit, " +
        "unit_size, special_conditions, bundle_quantity, bundle_price, ad_date"
      )
      .eq("canonical_product_id", id)
      .order("sale_price", { ascending: true })

    if (pricesErr) throw pricesErr

    return NextResponse.json(
      { product, current_prices: prices ?? [] },
      { headers: { "Cache-Control": CACHE } }
    )
  } catch (err) {
    console.error(`[/api/product/${id}]`, err)
    return NextResponse.json({ error: "Failed to load product" }, { status: 500 })
  }
}
