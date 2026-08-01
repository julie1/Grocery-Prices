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
import { FeedbackWidget }                            from "@/components/feedback-widget"
import { categoryGroupFor, GROUP_ORDER, STORE_COLORS } from "@/lib/colors"
import {
  ShoppingCart, TrendingDown, Store,
  BarChart3, Loader2, AlertCircle, ChevronDown, Calendar,
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

// Reshape flat trend rows into recharts format, as two series (average and
// lowest price seen that week) so the trend chart shows more than one line.
function reshapeTrend(rows: TrendPoint[], avgLabel: string, minLabel: string): {
  chartData: PriceHistoryData[]
  storeNames: string[]
} {
  const chartData: PriceHistoryData[] = rows.map(r => ({
    date: new Date(r.ad_date + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric",
    }),
    [avgLabel]: r.avg_price,
    [minLabel]: r.min_price,
  }))
  return { chartData, storeNames: [avgLabel, minLabel] }
}

// Reshape basket data into recharts format.
// Each store's raw value from the API is now a BasketCell object
// ({ total, matched_count, total_items, coverage, confidence }) or null —
// not a plain number — so we pull `.total` out for charting and carry
// `.confidence` along under a parallel key in case the chart wants to
// style low-confidence points differently later.
function reshapeBasket(rows: Record<string, any>[], stores: string[]): PriceHistoryData[] {
  return rows.map(row => {
    const entry: PriceHistoryData = {
      date: new Date(row.ad_date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short", day: "numeric",
      }),
    }
    for (const store of stores) {
      const cell = row[store]
      if (cell !== null && cell !== undefined) {
        entry[store] = typeof cell === "number" ? cell : cell.total
        entry[`${store}_confidence`] = typeof cell === "number" ? undefined : cell.confidence
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
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [selectedDate,   setSelectedDate]   = useState<string>("")  // "" = latest ad
  const [searchResults,  setSearchResults]  = useState<SearchResult[]>([])
  const [trendData,      setTrendData]      = useState<PriceHistoryData[]>([])
  const [trendStores,    setTrendStores]    = useState<string[]>([])
  const [trendWeeks,     setTrendWeeks]     = useState<number>(24)
  const [basketData,     setBasketData]     = useState<PriceHistoryData[]>([])
  const [basketStores,   setBasketStores]   = useState<string[]>([])
  const [visibleStores,  setVisibleStores]  = useState<string[]>([])

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

  // ── Fetch this store's available ad dates when store changes ──────────────
  useEffect(() => {
    if (!selectedStore) return
    setSelectedDate("")  // reset to "latest" whenever the store changes
    fetch(`/api/ad-dates?store=${encodeURIComponent(selectedStore)}`)
      .then(r => r.json())
      .then(data => setAvailableDates(data.dates ?? []))
      .catch(() => setAvailableDates([]))
  }, [selectedStore])

  // ── Fetch deals when store or date changes (browse mode, not searching) ───
  useEffect(() => {
    if (!selectedStore || isSearching || viewMode !== "browse") return
    setLoadingDeals(true)
    setDeals([])
    const dateParam = selectedDate ? `&date=${encodeURIComponent(selectedDate)}` : ""
    fetch(`/api/deals?store=${encodeURIComponent(selectedStore)}&limit=120${dateParam}`)
      .then(r => r.json())
      .then(data => {
        setDeals(data.deals ?? [])
        setCurrentAdDate(data.ad_date ?? null)
      })
      .catch(() => setError("Could not load deals"))
      .finally(() => setLoadingDeals(false))
  }, [selectedStore, selectedDate, viewMode, isSearching])

  // ── Fetch category trend when store, category, or zoom range changes ──────
  useEffect(() => {
    if (!selectedStore || viewMode !== "trends") return
    setLoadingTrends(true)
    setTrendData([])
    fetch(`/api/categories?store=${encodeURIComponent(selectedStore)}&category=${encodeURIComponent(selectedCat)}&weeks=${trendWeeks}`)
      .then(r => r.json())
      .then(data => {
        const { chartData, storeNames } = reshapeTrend(data.trend ?? [], "Average", "Lowest seen")
        setTrendData(chartData)
        setTrendStores(storeNames)
      })
      .catch(() => setError("Could not load trend data"))
      .finally(() => setLoadingTrends(false))
  }, [selectedStore, selectedCat, viewMode, trendWeeks])

  // ── Fetch basket once when basket tab is selected ─────────────────────────
  useEffect(() => {
    if (viewMode !== "basket" || basketLoaded.current) return
    setLoadingBasket(true)
    fetch("/api/basket?weeks=24")
      .then(r => r.json())
      .then(data => {
        const stores: string[] = data.stores ?? []
        setBasketStores(stores)
        setVisibleStores(stores)
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

  // ── Group deals by category, then bucket categories into shopping-list
  //    sections (Fresh Produce, Meat & Seafood, Dairy & Eggs, ...) so the
  //    Browse page reads like a shopping list instead of a flat, effectively
  //    random ordering of unrelated categories. ──────────────────────────────
  const dealsByCategory = deals.reduce<Record<string, DealRow[]>>((acc, deal) => {
    const cat = deal.category_name ?? "Other"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(deal)
    return acc
  }, {})

  const sectionsByGroup = GROUP_ORDER.map(group => {
    const categories = Object.entries(dealsByCategory)
      .filter(([cat]) => categoryGroupFor(cat).group === group)
      .sort(([a], [b]) => a.localeCompare(b))
    return { group, color: categoryGroupFor(categories[0]?.[0]).color, categories }
  }).filter(section => section.categories.length > 0)

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
            <div className="flex items-center justify-between gap-4 flex-wrap">
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
                        style={selectedStore === store.name ? { borderColor: STORE_COLORS[store.name] } : undefined}
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

              {/* Date picker — only meaningful in browse mode */}
              {viewMode === "browse" && availableDates.length > 0 && (
                <div className="flex items-center gap-2 py-2">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="relative inline-block">
                    <select
                      value={selectedDate}
                      onChange={e => setSelectedDate(e.target.value)}
                      className="appearance-none bg-card border border-border rounded-lg pl-3 pr-8 py-1.5 text-sm text-foreground cursor-pointer"
                    >
                      <option value="">Latest ad ({fmtDate(availableDates[0])})</option>
                      {availableDates.slice(1).map(d => (
                        <option key={d} value={d}>{fmtDate(d)}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              )}
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
              <div className="flex flex-col gap-10">
                {sectionsByGroup.map(({ group, color, categories }) => (
                  <div key={group}>
                    <div className="flex items-center gap-2 mb-4">
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <h2 className="text-base font-bold text-foreground">
                        {group}
                      </h2>
                      <span className="text-xs text-muted-foreground">
                        ({categories.reduce((n, [, items]) => n + items.length, 0)} items)
                      </span>
                    </div>
                    <div className="flex flex-col gap-6 pl-1">
                      {categories.map(([cat, items]) => (
                        <section key={cat}>
                          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                            {cat} <span className="font-normal">({items.length})</span>
                          </h3>
                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {items.map(deal => (
                              <div
                                key={deal.id}
                                className="rounded-xl border border-border bg-card p-4 border-l-4"
                                style={{ borderLeftColor: color }}
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
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TRENDS VIEW */}
        {!isSearching && viewMode === "trends" && (
          <div>
            <div className="flex flex-col sm:flex-row gap-4 mb-4 items-start sm:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
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
                  <strong style={{ color: categoryGroupFor(selectedCat).color }}>{selectedCat}</strong> at <strong>{selectedStore}</strong>
                </p>
              </div>

              {/* Zoom-out presets — how far back to fetch. The chart's own
                  brush handles zooming in within whatever range is loaded. */}
              <div className="flex gap-1">
                {[8, 24, 52].map(w => (
                  <button
                    key={w}
                    onClick={() => setTrendWeeks(w)}
                    className={[
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                      trendWeeks === w
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border border-border text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {w === 52 ? "1 year" : `${w} weeks`}
                  </button>
                ))}
              </div>
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
              <PriceChart
                data={trendData}
                stores={trendStores}
                title={`${selectedCat} price history`}
                subtitle={`Weekly average and lowest sale price at ${selectedStore}`}
                colors={{ "Average": categoryGroupFor(selectedCat).color, "Lowest seen": "#94a3b8" }}
              />
            )}
          </div>
        )}

        {/* BASKET VIEW */}
        {!isSearching && viewMode === "basket" && (
          <div>
            <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Inflation Basket Comparison
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Total cost of common staples per store, tracked weekly from ad prices.
                </p>
              </div>

              {/* Store toggles — pick one, a few, or all 4 to compare */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setVisibleStores(basketStores)}
                  className={[
                    "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                    visibleStores.length === basketStores.length
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  Compare all 4
                </button>
                {basketStores.map(store => {
                  const active = visibleStores.includes(store)
                  return (
                    <button
                      key={store}
                      onClick={() => setVisibleStores(prev =>
                        active
                          ? prev.filter(s => s !== store)
                          : [...prev, store]
                      )}
                      className={[
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                        active
                          ? "text-foreground border-transparent"
                          : "bg-card border-border text-muted-foreground hover:text-foreground",
                      ].join(" ")}
                      style={active ? { backgroundColor: `${STORE_COLORS[store]}22`, borderColor: STORE_COLORS[store] } : undefined}
                    >
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: STORE_COLORS[store] ?? "#94a3b8" }}
                      />
                      {store}
                    </button>
                  )
                })}
              </div>
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
            ) : visibleStores.length === 0 ? (
              <div className="flex items-center justify-center h-48 rounded-xl border border-border bg-card">
                <p className="text-muted-foreground text-sm">
                  Pick at least one store above to see its basket cost.
                </p>
              </div>
            ) : (
              <PriceChart
                data={basketData}
                stores={visibleStores}
                title="Inflation basket cost over time"
                subtitle={
                  visibleStores.length === basketStores.length
                    ? "Comparing all 4 stores"
                    : `Comparing ${visibleStores.join(", ")}`
                }
              />
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

      <FeedbackWidget
        page={isSearching ? "search" : viewMode}
        context={
          isSearching
            ? { query: debouncedQuery }
            : viewMode === "browse"
            ? { store: selectedStore, date: selectedDate || currentAdDate }
            : viewMode === "trends"
            ? { store: selectedStore, category: selectedCat, weeks: trendWeeks }
            : { visibleStores }
        }
      />
    </div>
  )
}
