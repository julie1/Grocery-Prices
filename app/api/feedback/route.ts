// app/api/feedback/route.ts
// =============================================================================
// POST /api/feedback
// =============================================================================
//
// Body: { page: string, sentiment: "love"|"good"|"okay"|"bad",
//          issue_tags?: string[], comment?: string, context?: object }
//
// Inserts a row into the `feedback` table. Write-only from the frontend;
// there's no GET here since feedback is reviewed directly in Supabase.
//
// Schema change from the old binary up/down version: `rating` (text,
// "up"|"down") was replaced by `sentiment` (text, one of the 4 values
// above) and a new `issue_tags` (text[]) column was added. Run this once
// against existing tables before deploying this route:
//
//   alter table feedback add column if not exists sentiment text;
//   alter table feedback add column if not exists issue_tags text[];
//   -- old `rating` column can stay for historical rows, or be backfilled:
//   -- update feedback set sentiment = case rating when 'up' then 'good'
//   --   when 'down' then 'bad' end where sentiment is null;
// =============================================================================

import { NextRequest, NextResponse } from "next/server"
import { createServerClient }        from "@/lib/supabase"

const VALID_SENTIMENTS = ["love", "good", "okay", "bad"]

export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { page, sentiment, issue_tags, comment, context } = body ?? {}

  if (!page || !VALID_SENTIMENTS.includes(sentiment)) {
    return NextResponse.json(
      { error: `page and sentiment (${VALID_SENTIMENTS.join("|")}) are required` },
      { status: 400 }
    )
  }

  const sb = createServerClient()

  try {
    const { error } = await sb.from("feedback").insert({
      page,
      sentiment,
      issue_tags: Array.isArray(issue_tags) && issue_tags.length ? issue_tags : null,
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
