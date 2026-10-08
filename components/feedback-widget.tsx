"use client"

import { useState } from "react"
import { MessageSquarePlus, X, Check } from "lucide-react"

interface FeedbackWidgetProps {
  page: string                    // "browse" | "trends" | "basket"
  context?: Record<string, any>   // whatever's on screen — store, category, date range
}

type Status = "closed" | "open" | "sent"
type Sentiment = "love" | "good" | "okay" | "bad"

const SENTIMENTS: { value: Sentiment; label: string }[] = [
  { value: "love", label: "Love it" },
  { value: "good", label: "Good" },
  { value: "okay", label: "Okay" },
  { value: "bad",  label: "Needs work" },
]

// Only shown for "okay" / "bad" — asking what's wrong to someone who's happy
// just adds friction for no reason.
const ISSUE_TAGS: Record<string, string[]> = {
  browse: ["Price looks wrong", "Wrong category", "Can't find a product", "Confusing layout", "Other"],
  trends: ["Chart is confusing", "Missing a store", "Doesn't match real prices", "Missing a product", "Other"],
  basket: ["Total seems off", "Missing an item", "Store comparison unclear", "Other"],
}

export function FeedbackWidget({ page, context }: FeedbackWidgetProps) {
  const [status, setStatus]       = useState<Status>("closed")
  const [sentiment, setSentiment] = useState<Sentiment | null>(null)
  const [tags, setTags]           = useState<string[]>([])
  const [comment, setComment]     = useState("")
  const [sending, setSending]     = useState(false)

  const needsDetail = sentiment === "okay" || sentiment === "bad"
  const tagOptions = ISSUE_TAGS[page] ?? []

  const reset = () => {
    setStatus("closed")
    setSentiment(null)
    setTags([])
    setComment("")
  }

  const toggleTag = (tag: string) => {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const submit = async () => {
    if (!sentiment) return
    setSending(true)
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, sentiment, issue_tags: tags, comment, context }),
      })
    } catch {
      // fail quietly — feedback isn't critical path
    } finally {
      setSending(false)
      setStatus("sent")
      setTimeout(reset, 1800)
    }
  }

  if (status === "closed") {
    return (
      <button
        onClick={() => setStatus("open")}
        className="fixed bottom-5 right-5 z-20 flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium shadow-lg hover:opacity-90 transition-opacity"
        aria-label="Give feedback"
      >
        <MessageSquarePlus className="h-4 w-4" />
        Feedback
      </button>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-20 w-80 rounded-xl border border-border bg-card shadow-xl p-4">
      {status === "sent" ? (
        <div className="flex items-center gap-2 text-sm text-foreground py-2">
          <Check className="h-4 w-4 text-primary" />
          Thanks for the feedback!
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-foreground">
              How's this page working for you?
            </p>
            <button onClick={reset} aria-label="Close">
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {SENTIMENTS.map(s => (
              <button
                key={s.value}
                onClick={() => setSentiment(s.value)}
                className={[
                  "flex flex-col items-center justify-center rounded-lg border py-2 px-1 text-xs leading-tight text-center transition-colors",
                  sentiment === s.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {s.label}
              </button>
            ))}
          </div>

          {sentiment && needsDetail && tagOptions.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                What's the issue? (pick any that apply)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tagOptions.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={[
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      tags.includes(tag)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {sentiment && (
            <>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Optional: anything else to add?"
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                disabled={sending}
                onClick={submit}
                className="w-full mt-3 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {sending ? "Sending…" : "Send feedback"}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
