// lib/supabase.ts
// =============================================================================
// Supabase client + shared TypeScript types
// Updated for category-based architecture — July 2026
// =============================================================================
//
// Setup:
//   npm install @supabase/supabase-js
//
// Add to .env.local (and Vercel project settings → Environment Variables):
//   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
//
// Two client patterns:
//   createServerClient() — one instance per API route request (no shared state)
//   getBrowserClient()   — singleton for Client Components
//
// The service key (SUPABASE_SERVICE_KEY) is only used in Python scripts.
// It never goes in the Next.js app — the anon key + RLS handles read access.
// =============================================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js"

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.\n" +
    "Add them to .env.local and to Vercel → Settings → Environment Variables."
  )
}

// ---------------------------------------------------------------------------
// Server client — call inside each Route Handler (API route).
// A fresh instance per request avoids shared auth state between concurrent
// serverless function invocations.
// ---------------------------------------------------------------------------
export function createServerClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  })
}

// ---------------------------------------------------------------------------
// Browser singleton — import `supabase` in Client Components.
// ---------------------------------------------------------------------------
let _browserClient: SupabaseClient | null = null

export function getBrowserClient(): SupabaseClient {
  if (!_browserClient) {
    _browserClient = createClient(supabaseUrl, supabaseAnonKey)
  }
  return _browserClient
}

export const supabase = getBrowserClient()

// =============================================================================
// TypeScript types — match actual Supabase columns
// =============================================================================

// --- Raw table rows ---------------------------------------------------------

export interface Store {
  id:       number
  name:     string
  location: string | null
}

export interface Category {
  id:            number
  name:          string
  standard_unit: string   // "oz" | "lb" | "gallon" | "each" | "dozen" | "loaf"
  is_approved:   boolean
}

export interface Ad {
  id:           number
  store_id:     number
  ad_date:      string        // "YYYY-MM-DD"
  pdf_filename: string | null
  processed_at: string | null
}

export interface Price {
  id:                 number
  ad_id:              number
  category_id:        number | null
  sale_price:         number
  price_per_unit:     number | null
  unit_size:          string | null
  special_conditions: string | null
  bundle_quantity:    number | null
  bundle_price:       number | null
  raw_product_name:   string | null
}

export interface BasketItem {
  id:               number
  name:             string        // e.g. "Eggs", "Ground Beef"
  store_id:         number
  raw_name_match:   string        // expected raw_product_name string
  match_keywords:   string[]
  exclude_keywords: string[]
  unit:             string
  notes:            string | null
  is_active:        boolean
}

// --- View row types ---------------------------------------------------------

// v_store_summary — used by /api/stores
export interface StoreSummary {
  id:                   number
  name:                 string
  location:             string | null
  latest_ad_date:       string | null
  total_ads:            number
  total_prices:         number
  uncategorized_prices: number
}

// --- API response shapes ----------------------------------------------------

// /api/stores
export interface StoresResponse {
  stores: StoreSummary[]
}

// /api/deals
export interface DealRow {
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

export interface DealsResponse {
  deals:   DealRow[]
  total:   number
  ad_date: string | null
  store:   string
}

// /api/search
export interface SearchResult {
  id:                 number
  raw_product_name:   string
  sale_price:         number
  price_per_unit:     number | null
  unit_size:          string | null
  special_conditions: string | null
  category_id:        number | null
  category_name:      string | null
  ad_date:            string
  store_id:           number
  store_name:         string
  store_location:     string | null
}

export interface SearchResponse {
  results: SearchResult[]
  total:   number
}

// /api/categories
export interface TrendPoint {
  ad_date:   string
  avg_price: number
  min_price: number
  count:     number
}

export interface CategoriesResponse {
  trend:    TrendPoint[]
  category: string
  store:    string
}

// /api/basket
export type BasketWeek = {
  ad_date:      string
  Yokes:        number | null
  Rosauers:     number | null
  Safeway:      number | null
  "Fred Meyer": number | null
}

export interface BasketResponse {
  basket: BasketWeek[]
  stores: string[]
}
