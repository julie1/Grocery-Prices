"use client"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TrendingDown, TrendingUp, Minus, Check, X } from "lucide-react"

export interface StorePrice {
  store: string
  price: number
  inStock: boolean
  priceChange: number
  lastUpdated: string
}

interface PriceTableProps {
  prices: StorePrice[]
  productName: string
}

export function PriceTable({ prices, productName }: PriceTableProps) {
  const lowestPrice = Math.min(...prices.map((p) => p.price))

  const getPriceChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4 text-destructive" />
    if (change < 0) return <TrendingDown className="h-4 w-4 text-primary" />
    return <Minus className="h-4 w-4 text-muted-foreground" />
  }

  const formatPriceChange = (change: number) => {
    if (change === 0) return "No change"
    const prefix = change > 0 ? "+" : ""
    return `${prefix}$${change.toFixed(2)}`
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground">
          Current Prices for {productName}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Comparing prices across {prices.length} stores
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-muted-foreground">Store</TableHead>
            <TableHead className="text-muted-foreground">Price</TableHead>
            <TableHead className="text-muted-foreground">Change (7d)</TableHead>
            <TableHead className="text-muted-foreground">Availability</TableHead>
            <TableHead className="text-muted-foreground text-right">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prices.map((item) => (
            <TableRow key={item.store} className="border-border">
              <TableCell className="font-medium text-foreground">
                {item.store}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-semibold">
                    ${item.price.toFixed(2)}
                  </span>
                  {item.price === lowestPrice && (
                    <Badge className="bg-primary text-primary-foreground text-xs">
                      Best Price
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  {getPriceChangeIcon(item.priceChange)}
                  <span
                    className={
                      item.priceChange > 0
                        ? "text-destructive"
                        : item.priceChange < 0
                        ? "text-primary"
                        : "text-muted-foreground"
                    }
                  >
                    {formatPriceChange(item.priceChange)}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {item.inStock ? (
                  <div className="flex items-center gap-1.5 text-primary">
                    <Check className="h-4 w-4" />
                    <span>In Stock</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-destructive">
                    <X className="h-4 w-4" />
                    <span>Out of Stock</span>
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {item.lastUpdated}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
