"use client"

import { useState } from "react"
import { SearchBar } from "@/components/search-bar"
import { PriceTable, StorePrice } from "@/components/price-table"
import { PriceChart, PriceHistoryData } from "@/components/price-chart"
import { ProductCard } from "@/components/product-card"
import { ShoppingCart, TrendingDown, Store, BarChart3 } from "lucide-react"

// Mock data for demonstration
const mockProducts = [
  { id: 1, name: "Organic Whole Milk", category: "Dairy", lowestPrice: 4.99, highestPrice: 7.49, priceChange: -3 },
  { id: 2, name: "Large Brown Eggs (12pk)", category: "Dairy", lowestPrice: 3.49, highestPrice: 5.99, priceChange: 2 },
  { id: 3, name: "Whole Wheat Bread", category: "Bakery", lowestPrice: 3.29, highestPrice: 4.99, priceChange: 0 },
  { id: 4, name: "Bananas (per lb)", category: "Produce", lowestPrice: 0.59, highestPrice: 0.79, priceChange: -5 },
  { id: 5, name: "Chicken Breast (per lb)", category: "Meat", lowestPrice: 6.99, highestPrice: 9.99, priceChange: 4 },
  { id: 6, name: "Extra Virgin Olive Oil", category: "Pantry", lowestPrice: 8.99, highestPrice: 14.99, priceChange: -2 },
]

const mockStorePrices: StorePrice[] = [
  { store: "Whole Foods", price: 6.49, inStock: true, priceChange: 0.30, lastUpdated: "2 hours ago" },
  { store: "Trader Joe's", price: 5.49, inStock: true, priceChange: -0.20, lastUpdated: "1 hour ago" },
  { store: "Safeway", price: 5.99, inStock: true, priceChange: 0, lastUpdated: "3 hours ago" },
  { store: "Costco", price: 4.99, inStock: true, priceChange: -0.50, lastUpdated: "30 min ago" },
  { store: "Target", price: 5.79, inStock: false, priceChange: 0.15, lastUpdated: "4 hours ago" },
]

const generatePriceHistory = (): PriceHistoryData[] => {
  const stores = ["Whole Foods", "Trader Joe's", "Safeway", "Costco", "Target"]
  const basePrices: Record<string, number> = {
    "Whole Foods": 6.49,
    "Trader Joe's": 5.49,
    "Safeway": 5.99,
    "Costco": 4.99,
    "Target": 5.79,
  }

  const data: PriceHistoryData[] = []
  const now = new Date()

  for (let i = 29; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" })

    const entry: PriceHistoryData = { date: dateStr }
    stores.forEach((store) => {
      const variation = (Math.random() - 0.5) * 0.8
      entry[store] = Number((basePrices[store] + variation).toFixed(2))
    })
    data.push(entry)
  }

  return data
}

const priceHistoryData = generatePriceHistory()
const stores = ["Whole Foods", "Trader Joe's", "Safeway", "Costco", "Target"]

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedProduct, setSelectedProduct] = useState<string | null>("Organic Whole Milk")

  const filteredProducts = mockProducts.filter(
    (product) =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <ShoppingCart className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">PriceScope</h1>
                <p className="text-xs text-muted-foreground">Compare grocery prices</p>
              </div>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Browse
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Deals
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Lists
              </a>
              <a href="#" className="text-sm text-primary font-medium">
                Sign In
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="border-b border-border bg-card/50">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-foreground mb-4 text-balance">
              Find the Best Grocery Prices
            </h2>
            <p className="text-lg text-muted-foreground mb-8 text-pretty">
              Compare prices across your favorite stores and save money on every shopping trip.
            </p>
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-b border-border">
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Store className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">50+</p>
                <p className="text-sm text-muted-foreground">Stores</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <ShoppingCart className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">10K+</p>
                <p className="text-sm text-muted-foreground">Products</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <TrendingDown className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">$127</p>
                <p className="text-sm text-muted-foreground">Avg. Savings/mo</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">1M+</p>
                <p className="text-sm text-muted-foreground">Price Updates</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Product Cards */}
          <div className="lg:col-span-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                {searchQuery ? "Search Results" : "Popular Products"}
              </h3>
              <span className="text-sm text-muted-foreground">
                {filteredProducts.length} items
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  name={product.name}
                  category={product.category}
                  lowestPrice={product.lowestPrice}
                  highestPrice={product.highestPrice}
                  priceChange={product.priceChange}
                  onClick={() => setSelectedProduct(product.name)}
                />
              ))}
              {filteredProducts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No products found matching your search.
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Price Details */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {selectedProduct ? (
              <>
                <PriceTable prices={mockStorePrices} productName={selectedProduct} />
                <PriceChart data={priceHistoryData} stores={stores} />
              </>
            ) : (
              <div className="flex items-center justify-center h-64 rounded-xl border border-border bg-card">
                <p className="text-muted-foreground">
                  Select a product to view price comparison
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 mt-12">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">PriceScope</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Prices updated in real-time from local stores.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
