// lib/colors.ts
// =============================================================================
// Central color + grouping system for the frontend.
//
// Two concerns live here:
//   1. CATEGORY_GROUPS — how the 25 price categories are organized into
//      shopping-list-style sections on the Browse page (produce, meat,
//      dairy, etc.) instead of a flat alphabetical list. Each group has a
//      color used for its section header and card accents.
//   2. STORE_COLORS — a fixed color per store, used consistently on the
//      Trends and Basket charts so "Yokes" is always the same color
//      everywhere in the app.
// =============================================================================

export interface CategoryGroup {
  group: string
  color: string       // hex, used for accents/badges
  colorSoft: string   // low-opacity background tint (light+dark safe)
}

// Maps each category name (as stored in `categories.name`) to a shopping
// section + color. Order of GROUP_ORDER below determines section order on
// the Browse page.
export const CATEGORY_GROUPS: Record<string, CategoryGroup> = {}

const GROUP_COLORS: Record<string, string> = {
  "Fresh Produce":       "#22c55e", // green
  "Meat & Seafood":      "#e11d48", // rose
  "Dairy & Eggs":        "#eab308", // yellow
  "Bakery & Pantry":     "#d97706", // amber/brown
  "Frozen":              "#0ea5e9", // sky blue
  "Beverages & Snacks":  "#a855f7", // purple
  "Household":           "#0d9488", // teal
  "Other":               "#6b7280", // neutral gray fallback
}

const GROUP_MEMBERS: Record<string, string[]> = {
  "Fresh Produce":      ["Fresh Produce"],
  "Meat & Seafood":     ["Bacon", "Beef (Other)", "Chicken", "Deli Meat", "Ground Beef", "Pork", "Seafood"],
  "Dairy & Eggs":       ["Butter", "Cheese", "Eggs", "Milk", "Yogurt"],
  "Bakery & Pantry":    ["Bread", "Canned Goods", "Cereal", "Cooking Essentials", "Pasta & Rice", "Soup"],
  "Frozen":             ["Frozen Meals", "Frozen Vegetables", "Ice Cream"],
  "Beverages & Snacks": ["Beverages", "Snacks"],
  "Household":          ["Household & Cleaning"],
}

// Order groups should appear in on the Browse page — roughly the order
// you'd walk a grocery store, produce first.
export const GROUP_ORDER = [
  "Fresh Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery & Pantry",
  "Frozen",
  "Beverages & Snacks",
  "Household",
  "Other",
]

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "")
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

for (const [group, members] of Object.entries(GROUP_MEMBERS)) {
  const color = GROUP_COLORS[group]
  for (const name of members) {
    CATEGORY_GROUPS[name] = { group, color, colorSoft: hexToRgba(color, 0.12) }
  }
}

export function categoryGroupFor(categoryName: string | null | undefined): CategoryGroup {
  if (categoryName && CATEGORY_GROUPS[categoryName]) return CATEGORY_GROUPS[categoryName]
  const color = GROUP_COLORS["Other"]
  return { group: "Other", color, colorSoft: hexToRgba(color, 0.12) }
}

// ---------------------------------------------------------------------------
// Store colors — fixed and consistent across Trends + Basket charts.
// ---------------------------------------------------------------------------
export const STORE_COLORS: Record<string, string> = {
  "Yokes":      "#3b82f6", // blue
  "Rosauers":   "#f59e0b", // amber
  "Safeway":    "#ec4899", // pink
  "Fred Meyer": "#10b981", // emerald
}

const FALLBACK_STORE_COLORS = ["#3b82f6", "#f59e0b", "#ec4899", "#10b981", "#8b5cf6", "#ef4444"]

export function storeColor(storeName: string, indexFallback: number): string {
  return STORE_COLORS[storeName] ?? FALLBACK_STORE_COLORS[indexFallback % FALLBACK_STORE_COLORS.length]
}
