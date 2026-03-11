"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

export interface PriceHistoryData {
  date: string
  [store: string]: number | string
}

interface PriceChartProps {
  data: PriceHistoryData[]
  stores: string[]
}

const COLORS = [
  "hsl(175, 60%, 50%)",
  "hsl(200, 50%, 45%)",
  "hsl(220, 45%, 40%)",
  "hsl(160, 55%, 48%)",
  "hsl(190, 48%, 42%)",
]

export function PriceChart({ data, stores }: PriceChartProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">
          Price History (Last 30 Days)
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Track price trends across different stores
        </p>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 5%, 22%)" />
            <XAxis
              dataKey="date"
              stroke="hsl(0, 0%, 55%)"
              tick={{ fill: "hsl(0, 0%, 55%)", fontSize: 12 }}
            />
            <YAxis
              stroke="hsl(0, 0%, 55%)"
              tick={{ fill: "hsl(0, 0%, 55%)", fontSize: 12 }}
              tickFormatter={(value) => `$${value}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(240, 5%, 17%)",
                border: "1px solid hsl(240, 5%, 28%)",
                borderRadius: "8px",
                color: "hsl(0, 0%, 96%)",
              }}
              labelStyle={{ color: "hsl(0, 0%, 96%)" }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, ""]}
            />
            <Legend
              wrapperStyle={{ color: "hsl(0, 0%, 96%)" }}
            />
            {stores.map((store, index) => (
              <Line
                key={store}
                type="monotone"
                dataKey={store}
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, fill: COLORS[index % COLORS.length] }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
