"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative w-full max-w-2xl">
      <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder="Search for groceries (e.g., milk, eggs, bread...)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-14 pl-12 pr-4 text-lg bg-card border-border rounded-xl"
      />
    </div>
  )
}
