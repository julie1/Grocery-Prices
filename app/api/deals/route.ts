// app/api/feedback/route.ts
// =============================================================================
// POST /api/feedback
// =============================================================================
//
// Body: { page: string, rating: "up" | "down", comment?: string, context?: object }
//
// Inserts a row into the `feedback` table (see supabase/create_feedback_table.sql
// — run that migration once before this route will work). Write-only from
// the frontend; there's no GET here since feedback is reviewed directly in
// Supabase for now.
// =============================================================================

import { NextRequest, NextResponse } from "next/server"
import { createServerClient }        from "@/lib/supabase"

export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { page, rating, comment, context } = body ?? {}

  if (!page || (rating !== "up" && rating !== "down")) {
    return NextResponse.json(
      { error: "page and rating ('up' | 'down') are required" },
      { status: 400 }
    )
  }

  const sb = createServerClient()

  try {
    const { error } = await sb.from("feedback").insert({
      page,
      rating,
      comment: comment?.trim() || null,
      context: context ?? null,
    })

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[/api/feedback]", err)
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 })
  }
}
