"use client"

import { Card, CardContent } from "@/components/ui/card"
import { TrendingDown, TrendingUp, Minus } from "lucide-react"

interface ProductCardProps {
  name: string
  category: string
  lowestPrice: number
  highestPrice: number
  priceChange: number
  onClick: () => void
}

export function ProductCard({
  name,
  category,
  lowestPrice,
  highestPrice,
  priceChange,
  onClick,
}: ProductCardProps) {
  const getPriceChangeIcon = () => {
    if (priceChange > 0) return <TrendingUp className="h-4 w-4" />
    if (priceChange < 0) return <TrendingDown className="h-4 w-4" />
    return <Minus className="h-4 w-4" />
  }

  const getPriceChangeColor = () => {
    if (priceChange > 0) return "text-destructive"
    if (priceChange < 0) return "text-primary"
    return "text-muted-foreground"
  }

  return (
    <Card
      className="bg-card border-border cursor-pointer transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {category}
            </p>
            <h4 className="text-foreground font-semibold mt-1">{name}</h4>
          </div>
          <div className={`flex items-center gap-1 ${getPriceChangeColor()}`}>
            {getPriceChangeIcon()}
            <span className="text-sm">
              {priceChange > 0 ? "+" : ""}
              {priceChange}%
            </span>
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-primary">
            ${lowestPrice.toFixed(2)}
          </span>
          <span className="text-sm text-muted-foreground">
            - ${highestPrice.toFixed(2)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Price range across stores
        </p>
      </CardContent>
    </Card>
  )
}
