"use client"

// =============================================================================
// app/page.tsx — Spokane Grocery Price Tracker
// =============================================================================
//
// Replaces the v0 mock-data scaffold with real Supabase data via the API routes.
//
// Layout (preserves your existing component structure):
//   Header → Hero+Search → Store tabs → [Product list | Price table + Chart]
//
// Data flow:
//   Mount          → fetch /api/stores  (store tabs + ad freshness)
//   Store tab click → fetch /api/deals?store=X  (browse circular)
//   Search typing  → debounced fetch /api/search?q=...
//   Product click  → fetch /api/product/[id] + /api/product/[id]/history
//
// Important: while canonical_product_id is null on most rows (normalize_agent
// not yet run), deals view still shows all items using raw_product_name.
// Clicking an unnormalized item does nothing (no id to navigate to).
// Once normalization runs, the product detail view becomes available.
// =============================================================================

import { useState, useEffect, useCallback } from "react"
import { SearchBar }                         from "@/components/search-bar"
import { PriceTable, StorePrice }            from "@/components/price-table"
import { PriceChart, PriceHistoryData }      from "@/components/price-chart"
import { ProductCard }                       from "@/components/product-card"
import {
  ShoppingCart, TrendingDown, Store,
  BarChart3, Loader2, AlertCircle,
} from "lucide-react"
import type {
  SearchProduct,
  DealRow,
  PriceHistoryPoint,
  StoreSummary,
} from "@/lib/supabase"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reshape flat history rows into the recharts format PriceChart expects:
 *   [{ date: "Apr 1", Safeway: 4.99, Yokes: 5.29 }, ...]
 *
 * One entry per unique ad_date; each store becomes a keyed property.
 * Missing store/date combinations are left undefined (recharts handles gaps).
 */
function reshapeHistory(rows: PriceHistoryPoint[]): {
  chartData:  PriceHistoryData[]
  storeNames: string[]
} {
  const storeNames = Array.from(new Set(rows.map(r => r.store_name))).sort()
  const byDate      = new Map<string, PriceHistoryData>()

  for (const row of rows) {
    // ad_date is "YYYY-MM-DD"; append T00:00:00 to avoid UTC-vs-local issues
    const label = new Date(row.ad_date + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric",
    })
    if (!byDate.has(label)) byDate.set(label, { date: label })
    byDate.get(label)![row.store_name] = row.sale_price
  }

  return { chartData: Array.from(byDate.values()), storeNames }
}

/**
 * Map a price row from /api/product/[id] to the StorePrice shape
 * expected by the existing PriceTable component.
 */
function toStorePrice(row: {
  store_name:        string
  sale_price:        number
  ad_date:           string
  special_conditions?: string | null
}): StorePrice {
  return {
    store:       row.store_name,
    price:       row.sale_price,
    inStock:     true,   // weekly ads don't track stock — assume available
    priceChange: 0,      // could compute from history; left as 0 for now
    lastUpdated: new Date(row.ad_date + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric",
    }),
  }
}

/** Format a YYYY-MM-DD date as "May 14" */
function fmtDate(d: string | null | undefined): string {
  if (!d) return "—"
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric",
  })
}

/** Simple debounce hook */
function useDebounce<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function HomePage() {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [searchQuery,     setSearchQuery]     = useState("")
  const [selectedStore,   setSelectedStore]   = useState<string>("")
  const [selectedProduct, setSelectedProduct] = useState<SearchProduct | null>(null)

  // ── Data state ────────────────────────────────────────────────────────────
  const [stores,          setStores]          = useState<StoreSummary[]>([])
  const [searchResults,   setSearchResults]   = useState<SearchProduct[]>([])
  const [weeklyDeals,     setWeeklyDeals]     = useState<DealRow[]>([])
  const [currentAdDate,   setCurrentAdDate]   = useState<string | null>(null)
  const [storePrices,     setStorePrices]     = useState<StorePrice[]>([])
  const [chartData,       setChartData]       = useState<PriceHistoryData[]>([])
  const [chartStores,     setChartStores]     = useState<string[]>([])

  // ── Loading / error state ─────────────────────────────────────────────────
  const [loadingStores,   setLoadingStores]   = useState(true)
  const [loadingDeals,    setLoadingDeals]    = useState(false)
  const [loadingSearch,   setLoadingSearch]   = useState(false)
  const [loadingProduct,  setLoadingProduct]  = useState(false)
  const [error,           setError]           = useState<string | null>(null)

  const debouncedQuery = useDebounce(searchQuery, 350)

  // ── Fetch stores on mount ─────────────────────────────────────────────────
  useEffect(() => {
    setLoadingStores(true)
    fetch("/api/stores")
      .then(r => r.json())
      .then(data => {
        if (data.stores?.length) {
          setStores(data.stores)
          setSelectedStore(data.stores[0].name)   // default to first store
        }
      })
      .catch(() => setError("Could not load stores"))
      .finally(() => setLoadingStores(false))
  }, [])

  // ── Fetch weekly deals when store changes (and not searching) ─────────────
  useEffect(() => {
    if (!selectedStore || debouncedQuery) return
    setLoadingDeals(true)
    setWeeklyDeals([])
    fetch(`/api/deals?store=${encodeURIComponent(selectedStore)}&limit=80`)
      .then(r => r.json())
      .then(data => {
        setWeeklyDeals(data.deals ?? [])
        setCurrentAdDate(data.ad_date ?? null)
      })
      .catch(() => setError("Could not load deals"))
      .finally(() => setLoadingDeals(false))
  }, [selectedStore, debouncedQuery])

  // ── Search ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults([])
      return
    }
    setLoadingSearch(true)
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}&limit=30`)
      .then(r => r.json())
      .then(data => setSearchResults(data.products ?? []))
      .catch(() => setError("Search failed"))
      .finally(() => setLoadingSearch(false))
  }, [debouncedQuery])

  // ── Product detail + history ──────────────────────────────────────────────
  const handleSelectProduct = useCallback(async (product: SearchProduct) => {
    if (!product.canonical_product_id) return   // not yet normalized
    setSelectedProduct(product)
    setLoadingProduct(true)
    setStorePrices([])
    setChartData([])

    try {
      const [detailRes, histRes] = await Promise.all([
        fetch(`/api/product/${product.canonical_product_id}`),
        fetch(`/api/product/${product.canonical_product_id}/history?weeks=16`),
      ])
      const [detail, hist] = await Promise.all([detailRes.json(), histRes.json()])

      setStorePrices((detail.current_prices ?? []).map(toStorePrice))
      const { chartData: cd, storeNames: sn } = reshapeHistory(hist.history ?? [])
      setChartData(cd)
      setChartStores(sn)
    } catch {
      setError("Could not load product details")
    } finally {
      setLoadingProduct(false)
    }
  }, [])

  // ── Derive product list to display ────────────────────────────────────────
  const isSearching = debouncedQuery.length > 0

  // Convert DealRows to SearchProduct shape for ProductCard compatibility.
  // Unnormalized rows (canonical_product_id = null) still appear — they just
  // won't open a detail view when clicked.
  const dealsAsProducts: SearchProduct[] = weeklyDeals.map(d => ({
    canonical_product_id: d.canonical_product_id ?? 0,
    product_name:  d.product_name  ?? d.raw_product_name ?? "Unknown item",
    brand:         d.brand         ?? null,
    unit_size:     d.unit_size     ?? null,
    category_name: d.category_name ?? null,
    standard_unit: d.standard_unit ?? null,
    stores_this_week: 1,
    lowest_price:  d.sale_price,
    highest_price: d.sale_price,
    lowest_ppu:    d.price_per_unit ?? null,
    last_seen:     d.ad_date,
  }))

  const displayedProducts = isSearching ? searchResults : dealsAsProducts
  const isLoading         = loadingDeals || loadingSearch

  // ── Grand stats for the hero banner ──────────────────────────────────────
  const totalPrices    = stores.reduce((s, st) => s + st.total_prices, 0)
  const totalAds       = stores.reduce((s, st) => s + st.total_ads,    0)

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <ShoppingCart className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  Spokane Grocery Prices
                </h1>
                <p className="text-xs text-muted-foreground">
                  Yokes · Safeway · Rosauers · Fred Meyer
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero / Search ──────────────────────────────────────────────── */}
      <section className="border-b border-border bg-card/50">
        <div className="container mx-auto px-4 py-10">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-foreground mb-3 text-balance">
              Find the Best Grocery Deals in Spokane
            </h2>
            <p className="text-muted-foreground mb-6">
              Weekly ad prices from all four major stores — updated every week.
            </p>
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
          </div>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="container mx-auto px-4 py-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Store className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">
                  {loadingStores ? "—" : stores.length}
                </p>
                <p className="text-xs text-muted-foreground">Stores</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">
                  {loadingStores ? "—" : totalPrices.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Price records</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">
                  {loadingStores ? "—" : totalAds}
                </p>
                <p className="text-xs text-muted-foreground">Weekly ads</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <TrendingDown className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">
                  {currentAdDate ? fmtDate(currentAdDate) : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Latest ad</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Store tabs (hidden while searching) ────────────────────────── */}
      {!isSearching && (
        <div className="border-b border-border bg-card/30">
          <div className="container mx-auto px-4">
            <div className="flex gap-0 overflow-x-auto">
              {loadingStores
                ? [1,2,3,4].map(i => (
                    <div key={i}
                      className="h-12 w-28 m-1 rounded animate-pulse bg-muted" />
                  ))
                : stores.map(store => (
                    <button
                      key={store.id}
                      onClick={() => setSelectedStore(store.name)}
                      className={[
                        "flex flex-col items-start px-5 py-3 border-b-2 transition-colors whitespace-nowrap text-sm",
                        selectedStore === store.name
                          ? "border-primary text-foreground font-semibold"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      ].join(" ")}
                    >
                      <span>{store.name}</span>
                      {store.latest_ad_date && (
                        <span className="text-[10px] text-muted-foreground font-normal">
                          {fmtDate(store.latest_ad_date)}
                        </span>
                      )}
                    </button>
                  ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div className="container mx-auto px-4 pt-4">
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-auto text-xs underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">

          {/* Left — product list */}
          <div className="lg:col-span-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">
                {isSearching
                  ? `Results for "${debouncedQuery}"`
                  : `${selectedStore} — this week`}
              </h3>
              {!isLoading && (
                <span className="text-xs text-muted-foreground">
                  {displayedProducts.length} items
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="flex flex-col gap-3">
                {[1,2,3,4,5].map(i => (
                  <div key={i}
                    className="h-20 rounded-lg animate-pulse bg-muted" />
                ))}
              </div>
            ) : displayedProducts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {isSearching
                  ? "No products matched your search."
                  : "No deals found for this store."}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {displayedProducts.map((product, i) => (
                  <ProductCard
                    key={product.canonical_product_id || i}
                    name={product.product_name}
                    category={product.category_name ?? ""}
                    lowestPrice={product.lowest_price ?? 0}
                    highestPrice={product.highest_price ?? 0}
                    priceChange={0}
                    onClick={() =>
                      product.canonical_product_id
                        ? handleSelectProduct(product)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right — price detail + chart */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {loadingProduct ? (
              <div className="flex items-center justify-center h-48 rounded-xl border border-border bg-card">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : selectedProduct ? (
              <>
                {/* Product header */}
                <div className="rounded-xl border border-border bg-card px-5 py-4">
                  <p className="text-xs text-muted-foreground mb-0.5">
                    {selectedProduct.category_name ?? ""}
                  </p>
                  <h2 className="text-lg font-bold text-foreground">
                    {selectedProduct.brand
                      ? `${selectedProduct.brand} `
                      : ""}
                    {selectedProduct.product_name}
                  </h2>
                  {selectedProduct.unit_size && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {selectedProduct.unit_size}
                    </p>
                  )}
                </div>

                {storePrices.length > 0 && (
                  <PriceTable
                    prices={storePrices}
                    productName={selectedProduct.product_name}
                  />
                )}

                {chartData.length > 0 && (
                  <PriceChart data={chartData} stores={chartStores} />
                )}

                {storePrices.length === 0 && chartData.length === 0 && (
                  <div className="flex items-center justify-center h-32 rounded-xl border border-border bg-card">
                    <p className="text-sm text-muted-foreground">
                      No price data available yet for this product.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-border bg-card gap-3">
                <BarChart3 className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">
                  Select a product to compare prices and view trends
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card/50 mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                Spokane Grocery Prices
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Prices sourced from weekly store ads · Not affiliated with any store
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
