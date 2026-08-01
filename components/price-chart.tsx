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
import { RotateCcw } from "lucide-react"
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

  const lastIndex = Math.max(data.length - 1, 0)
  const startIndex = range?.start ?? 0
  const endIndex = range?.end ?? lastIndex

  const isZoomed = range !== null && (range.start > 0 || range.end < lastIndex)

  const lineColor = (key: string, index: number): string => {
    if (colors?.[key]) return colors[key]
    return storeColor(key, index)
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
        {showZoom && isZoomed && (
          <button
            onClick={() => setRange(null)}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/70 transition-colors shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset zoom
          </button>
        )}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              stroke="var(--muted-foreground)"
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
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
            {showZoom && data.length > 4 && (
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
      {showZoom && data.length > 4 && (
        <p className="text-[11px] text-muted-foreground mt-2 text-center">
          Drag the handles below the chart to zoom into a date range
        </p>
      )}
    </div>
  )
}
