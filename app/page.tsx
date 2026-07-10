"use client"

// =============================================================================
// app/page.tsx — Spokane Grocery Price Tracker
// =============================================================================
//
// Three main views:
//   1. Browse  — latest weekly circular per store, grouped by category
//   2. Trends  — category price trend chart per store (uses /api/categories)
//   3. Basket  — inflation basket cost over time across stores (/api/basket)
//
// Plus a search overlay (uses /api/search) that activates when typing.
//
// Data flow:
//   Mount            → /api/stores
//   Store tab click  → /api/deals?store=X  (Browse view)
//   Category select  → /api/categories?store=X&category=Y  (Trends view)
//   Basket tab       → /api/basket  (loaded once)
//   Search typing    → debounced /api/search?q=...
// =============================================================================

import { useState, useEffect, useCallback, useRef } from "react"
import { SearchBar }                                 from "@/components/search-bar"
import { PriceChart, PriceHistoryData }              from "@/components/price-chart"
import {
  ShoppingCart, TrendingDown, Store,
  BarChart3, Loader2, AlertCircle, ChevronDown,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoreSummary {
  id:              number
  name:            string
  location:        string | null
  latest_ad_date:  string | null
  total_ads:       number
  total_prices:    number
  uncategorized_prices: number
}

interface DealRow {
  id:                 number
  raw_product_name:   string
  sale_price:         number
  price_per_unit:     number | null
  unit_size:          string | null
  special_conditions: string | null
  bundle_quantity:    number | null
  bundle_price:       number | null
  category_id:        number | null
  category_name:      string | null
  ad_date:            string
}

interface SearchResult {
  id:                 number
  raw_product_name:   string
  sale_price:         number
  price_per_unit:     number | null
  unit_size:          string | null
  special_conditions: string | null
  category_name:      string | null
  ad_date:            string
  store_name:         string
  store_location:     string | null
}

interface TrendPoint {
  ad_date:   string
  avg_price: number
  min_price: number
  count:     number
}

type ViewMode = "browse" | "trends" | "basket"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—"
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric",
  })
}

function fmtPrice(p: number): string {
  return `$${p.toFixed(2)}`
}

function useDebounce<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

// Reshape flat trend rows into recharts format
function reshapeTrend(rows: TrendPoint[], field: "avg_price" | "min_price", label: string): {
  chartData: PriceHistoryData[]
  storeNames: string[]
} {
  const chartData: PriceHistoryData[] = rows.map(r => ({
    date: new Date(r.ad_date + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric",
    }),
    [label]: r[field],
  }))
  return { chartData, storeNames: [label] }
}

// Reshape basket data into recharts format
function reshapeBasket(rows: Record<string, any>[], stores: string[]): PriceHistoryData[] {
  return rows.map(row => {
    const entry: PriceHistoryData = {
      date: new Date(row.ad_date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short", day: "numeric",
      }),
    }
    for (const store of stores) {
      if (row[store] !== null && row[store] !== undefined) {
        entry[store] = row[store]
      }
    }
    return entry
  })
}

// Fixed category list for the trends dropdown (matches our categories table)
const CATEGORIES = [
  "Bacon", "Beef (Other)", "Beverages", "Bread", "Butter", "Canned Goods",
  "Cereal", "Cheese", "Chicken", "Cooking Essentials", "Deli Meat", "Eggs",
  "Fresh Produce", "Frozen Meals", "Frozen Vegetables", "Ground Beef",
  "Household & Cleaning", "Ice Cream", "Milk", "Pasta & Rice", "Pork",
  "Seafood", "Snacks", "Soup", "Yogurt",
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function HomePage() {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [searchQuery,    setSearchQuery]    = useState("")
  const [selectedStore,  setSelectedStore]  = useState<string>("")
  const [viewMode,       setViewMode]       = useState<ViewMode>("browse")
  const [selectedCat,    setSelectedCat]    = useState<string>(CATEGORIES[0])

  // ── Data state ────────────────────────────────────────────────────────────
  const [stores,         setStores]         = useState<StoreSummary[]>([])
  const [deals,          setDeals]          = useState<DealRow[]>([])
  const [currentAdDate,  setCurrentAdDate]  = useState<string | null>(null)
  const [searchResults,  setSearchResults]  = useState<SearchResult[]>([])
  const [trendData,      setTrendData]      = useState<PriceHistoryData[]>([])
  const [trendStores,    setTrendStores]    = useState<string[]>([])
  const [basketData,     setBasketData]     = useState<PriceHistoryData[]>([])
  const [basketStores,   setBasketStores]   = useState<string[]>([])

  // ── Loading / error ────────────────────────────────────────────────────────
  const [loadingStores,  setLoadingStores]  = useState(true)
  const [loadingDeals,   setLoadingDeals]   = useState(false)
  const [loadingSearch,  setLoadingSearch]  = useState(false)
  const [loadingTrends,  setLoadingTrends]  = useState(false)
  const [loadingBasket,  setLoadingBasket]  = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const basketLoaded = useRef(false)
  const debouncedQuery = useDebounce(searchQuery, 350)
  const isSearching = debouncedQuery.length > 0

  // ── Fetch stores on mount ─────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/stores")
      .then(r => r.json())
      .then(data => {
        if (data.stores?.length) {
          setStores(data.stores)
          setSelectedStore(data.stores[0].name)
        }
      })
      .catch(() => setError("Could not load stores"))
      .finally(() => setLoadingStores(false))
  }, [])

  // ── Fetch deals when store changes (browse mode, not searching) ───────────
  useEffect(() => {
    if (!selectedStore || isSearching || viewMode !== "browse") return
    setLoadingDeals(true)
    setDeals([])
    fetch(`/api/deals?store=${encodeURIComponent(selectedStore)}&limit=120`)
      .then(r => r.json())
      .then(data => {
        setDeals(data.deals ?? [])
        setCurrentAdDate(data.ad_date ?? null)
      })
      .catch(() => setError("Could not load deals"))
      .finally(() => setLoadingDeals(false))
  }, [selectedStore, viewMode, isSearching])

  // ── Fetch category trend when store or category changes ───────────────────
  useEffect(() => {
    if (!selectedStore || viewMode !== "trends") return
    setLoadingTrends(true)
    setTrendData([])
    fetch(`/api/categories?store=${encodeURIComponent(selectedStore)}&category=${encodeURIComponent(selectedCat)}&weeks=24`)
      .then(r => r.json())
      .then(data => {
        const { chartData, storeNames } = reshapeTrend(data.trend ?? [], "avg_price", `${selectedStore} avg`)
        setTrendData(chartData)
        setTrendStores(storeNames)
      })
      .catch(() => setError("Could not load trend data"))
      .finally(() => setLoadingTrends(false))
  }, [selectedStore, selectedCat, viewMode])

  // ── Fetch basket once when basket tab is selected ─────────────────────────
  useEffect(() => {
    if (viewMode !== "basket" || basketLoaded.current) return
    setLoadingBasket(true)
    fetch("/api/basket?weeks=24")
      .then(r => r.json())
      .then(data => {
        const stores: string[] = data.stores ?? []
        setBasketStores(stores)
        setBasketData(reshapeBasket(data.basket ?? [], stores))
        basketLoaded.current = true
      })
      .catch(() => setError("Could not load basket data"))
      .finally(() => setLoadingBasket(false))
  }, [viewMode])

  // ── Search ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults([])
      return
    }
    setLoadingSearch(true)
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}&limit=40`)
      .then(r => r.json())
      .then(data => setSearchResults(data.results ?? []))
      .catch(() => setError("Search failed"))
      .finally(() => setLoadingSearch(false))
  }, [debouncedQuery])

  // ── Group deals by category for display ───────────────────────────────────
  const dealsByCategory = deals.reduce<Record<string, DealRow[]>>((acc, deal) => {
    const cat = deal.category_name ?? "Other"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(deal)
    return acc
  }, {})

  const isLoading = loadingDeals || loadingSearch || loadingTrends || loadingBasket

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <span className="font-bold text-foreground">Spokane Grocery Prices</span>
          </div>
          <div className="flex gap-1">
            {(["browse", "trends", "basket"] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => { setViewMode(mode); setSearchQuery("") }}
                className={[
                  "px-3 py-1.5 rounded-md text-sm capitalize transition-colors",
                  viewMode === mode && !isSearching
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Hero + Search ───────────────────────────────────────────────── */}
      <section className="border-b border-border bg-card/30 py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center gap-4 justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Compare Grocery Prices
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Weekly ad prices from Yokes, Rosauers, Safeway &amp; Fred Meyer
              </p>
            </div>
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
          </div>

          {/* Stats row */}
          <div className="flex gap-6 mt-4">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">
                {stores.length} stores
              </span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">
                {currentAdDate ? `Ad: ${fmtDate(currentAdDate)}` : "Weekly ads"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">
                {deals.length > 0 ? `${deals.length} items` : ""}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Store tabs ──────────────────────────────────────────────────── */}
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

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <div className="container mx-auto px-4 pt-4">
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-xs underline">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="container mx-auto px-4 py-8">

        {/* SEARCH RESULTS */}
        {isSearching && (
          <div>
            <h3 className="text-base font-semibold mb-4">
              Results for &ldquo;{debouncedQuery}&rdquo;
              {!loadingSearch && (
                <span className="text-muted-foreground font-normal text-sm ml-2">
                  ({searchResults.length} items)
                </span>
              )}
            </h3>
            {loadingSearch ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching…
              </div>
            ) : searchResults.length === 0 ? (
              <p className="text-muted-foreground text-sm">No results found.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {searchResults.map(r => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {r.category_name ?? "Uncategorized"} · {r.store_name}
                    </p>
                    <p className="font-semibold text-foreground mt-1 text-sm leading-snug">
                      {r.raw_product_name}
                    </p>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-xl font-bold text-primary">
                        {fmtPrice(r.sale_price)}
                      </span>
                      {r.unit_size && (
                        <span className="text-xs text-muted-foreground">
                          {r.unit_size}
                        </span>
                      )}
                    </div>
                    {r.special_conditions && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {r.special_conditions}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Ad: {fmtDate(r.ad_date)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BROWSE VIEW */}
        {!isSearching && viewMode === "browse" && (
          <div>
            {loadingDeals ? (
              <div className="flex flex-col gap-3">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="h-16 rounded-lg animate-pulse bg-muted" />
                ))}
              </div>
            ) : deals.length === 0 ? (
              <p className="text-muted-foreground text-sm">No deals found for this store.</p>
            ) : (
              <div className="flex flex-col gap-8">
                {Object.entries(dealsByCategory)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([cat, items]) => (
                    <section key={cat}>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        {cat} <span className="font-normal">({items.length})</span>
                      </h3>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {items.map(deal => (
                          <div
                            key={deal.id}
                            className="rounded-xl border border-border bg-card p-4"
                          >
                            <p className="font-semibold text-foreground text-sm leading-snug">
                              {deal.raw_product_name}
                            </p>
                            <div className="mt-3 flex items-baseline gap-2">
                              <span className="text-xl font-bold text-primary">
                                {fmtPrice(deal.sale_price)}
                              </span>
                              {deal.unit_size && (
                                <span className="text-xs text-muted-foreground">
                                  {deal.unit_size}
                                </span>
                              )}
                            </div>
                            {deal.bundle_quantity && deal.bundle_price && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {deal.bundle_quantity} for {fmtPrice(deal.bundle_price)}
                              </p>
                            )}
                            {deal.special_conditions && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {deal.special_conditions}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  ))
                }
              </div>
            )}
          </div>
        )}

        {/* TRENDS VIEW */}
        {!isSearching && viewMode === "trends" && (
          <div>
            <div className="flex flex-col sm:flex-row gap-4 mb-6 items-start sm:items-center">
              <div>
                <label className="text-sm text-muted-foreground mr-2">Category:</label>
                <div className="relative inline-block">
                  <select
                    value={selectedCat}
                    onChange={e => setSelectedCat(e.target.value)}
                    className="appearance-none bg-card border border-border rounded-lg px-3 py-2 pr-8 text-sm text-foreground cursor-pointer"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Showing average sale price for <strong>{selectedCat}</strong> at <strong>{selectedStore}</strong> over 24 weeks
              </p>
            </div>

            {loadingTrends ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading trend data…
              </div>
            ) : trendData.length === 0 ? (
              <div className="flex items-center justify-center h-48 rounded-xl border border-border bg-card">
                <p className="text-muted-foreground text-sm">
                  No data for {selectedCat} at {selectedStore} in this period.
                </p>
              </div>
            ) : (
              <PriceChart data={trendData} stores={trendStores} />
            )}
          </div>
        )}

        {/* BASKET VIEW */}
        {!isSearching && viewMode === "basket" && (
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground">
                Inflation Basket Comparison
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Total cost of 25 common staples per store, tracked weekly from ad prices.
                Weeks with insufficient data are omitted.
              </p>
            </div>

            {loadingBasket ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading basket data…
              </div>
            ) : basketData.length === 0 ? (
              <div className="flex items-center justify-center h-48 rounded-xl border border-border bg-card">
                <p className="text-muted-foreground text-sm">
                  Not enough basket data yet — ingest more ads to see trends.
                </p>
              </div>
            ) : (
              <PriceChart data={basketData} stores={basketStores} />
            )}
          </div>
        )}

      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card/50 mt-12">
        <div className="container mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-3">
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
      </footer>
    </div>
  )
}
