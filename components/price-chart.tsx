"use client"

import { useState, useMemo } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Brush,
  ResponsiveContainer,
} from "recharts"
import { storeColor } from "@/lib/colors"

export interface PriceHistoryData {
  date: string
  [store: string]: number | string | undefined
}

interface PriceChartProps {
  data: PriceHistoryData[]
  stores: string[]
  title?: string
  subtitle?: string
  // Optional explicit color per line key, overrides the store-color lookup.
  // Useful for the Trends chart where lines aren't store names (e.g. "avg"/"min").
  colors?: Record<string, string>
  // Show the drag-to-zoom brush control at the bottom. Defaults to true.
  showZoom?: boolean
  height?: number
}

// Zoom presets, expressed in data points (roughly weeks, since each point
// is one ad week). "All" clears the zoom back to the full loaded range.
const ZOOM_PRESETS: { label: string; points: number | null }[] = [
  { label: "4W",  points: 4 },
  { label: "12W", points: 12 },
  { label: "26W", points: 26 },
  { label: "All", points: null },
]

export function PriceChart({
  data,
  stores,
  title = "Price History",
  subtitle = "Track price trends across different stores",
  colors,
  showZoom = true,
  height = 320,
}: PriceChartProps) {
  // Brush range, expressed as data indices. null = full range (no zoom applied yet).
  const [range, setRange] = useState<{ start: number; end: number } | null>(null)

  // Only keep rows where at least one of the currently-plotted lines has a
  // value. Without this, filtering the Basket view to a single store still
  // plots every date *any* store has an ad on — most of them null for the
  // selected store — which crowds the x-axis with mostly-irrelevant dates.
  const filteredData = useMemo(
    () => data.filter(row => stores.some(s => row[s] !== null && row[s] !== undefined)),
    [data, stores]
  )

  const lastIndex = Math.max(filteredData.length - 1, 0)
  const startIndex = range?.start ?? 0
  const endIndex = range?.end ?? lastIndex

  const isZoomed = range !== null && (range.start > 0 || range.end < lastIndex)

  // Cap how many x-axis labels render at once so they never overlap,
  // regardless of how many weeks of data are loaded.
  const visiblePoints = endIndex - startIndex + 1
  const tickInterval = Math.max(0, Math.ceil(visiblePoints / 10) - 1)

  const lineColor = (key: string, index: number): string => {
    if (colors?.[key]) return colors[key]
    return storeColor(key, index)
  }

  const applyPreset = (points: number | null) => {
    if (points === null || points >= filteredData.length) {
      setRange(null)
      return
    }
    const end = lastIndex
    const start = Math.max(0, end - points + 1)
    setRange({ start, end })
  }

  // A preset is "active" if it matches the current range (or "All" when unzoomed).
  const isPresetActive = (points: number | null) => {
    if (points === null || points >= filteredData.length) return !isZoomed
    return isZoomed && endIndex === lastIndex && startIndex === Math.max(0, lastIndex - points + 1)
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
        {showZoom && filteredData.length > 4 && (
          <div className="flex gap-1 shrink-0">
            {ZOOM_PRESETS.map(({ label, points }) => (
              <button
                key={label}
                onClick={() => applyPreset(points)}
                className={[
                  "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                  isPresetActive(points)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={filteredData}
            margin={{ top: 5, right: 20, left: 10, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              stroke="var(--muted-foreground)"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              interval={tickInterval}
              angle={-30}
              textAnchor="end"
              height={45}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={(value) => `$${value}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--popover-foreground)",
              }}
              labelStyle={{ color: "var(--popover-foreground)" }}
              formatter={(value: number) => [value != null ? `$${Number(value).toFixed(2)}` : "—", ""]}
            />
            <Legend wrapperStyle={{ color: "var(--foreground)" }} />
            {stores.map((store, index) => (
              <Line
                key={store}
                type="monotone"
                dataKey={store}
                stroke={lineColor(store, index)}
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: lineColor(store, index) }}
                activeDot={{ r: 6, fill: lineColor(store, index) }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
            {showZoom && filteredData.length > 4 && (
              <Brush
                dataKey="date"
                height={26}
                stroke="var(--primary)"
                fill="var(--muted)"
                travellerWidth={8}
                startIndex={startIndex}
                endIndex={endIndex}
                onChange={(r: any) => {
                  if (typeof r?.startIndex === "number" && typeof r?.endIndex === "number") {
                    setRange({ start: r.startIndex, end: r.endIndex })
                  }
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {showZoom && filteredData.length > 4 && (
        <p className="text-[11px] text-muted-foreground mt-2 text-center">
          Use the buttons above to zoom to a time interval, or drag the handles below the chart
        </p>
      )}
    </div>
  )
}
