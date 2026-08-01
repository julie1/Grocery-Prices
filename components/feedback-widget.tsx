"use client"

import { useState } from "react"
import { MessageSquarePlus, ThumbsUp, ThumbsDown, X, Check } from "lucide-react"

interface FeedbackWidgetProps {
  page: string                    // "browse" | "trends" | "basket"
  context?: Record<string, any>   // whatever's on screen — store, category, date range
}

type Status = "closed" | "open" | "sent"

export function FeedbackWidget({ page, context }: FeedbackWidgetProps) {
  const [status, setStatus]   = useState<Status>("closed")
  const [rating, setRating]   = useState<"up" | "down" | null>(null)
  const [comment, setComment] = useState("")
  const [sending, setSending] = useState(false)

  const reset = () => {
    setStatus("closed")
    setRating(null)
    setComment("")
  }

  const submit = async (r: "up" | "down") => {
    setRating(r)
    setSending(true)
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, rating: r, comment, context }),
      })
      setStatus("sent")
      setTimeout(reset, 1800)
    } catch {
      // fail quietly — feedback isn't critical path
      setStatus("sent")
      setTimeout(reset, 1800)
    } finally {
      setSending(false)
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
    <div className="fixed bottom-5 right-5 z-20 w-72 rounded-xl border border-border bg-card shadow-xl p-4">
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
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setRating("up")}
              className={[
                "flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm transition-colors",
                rating === "up"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <ThumbsUp className="h-4 w-4" /> Good
            </button>
            <button
              onClick={() => setRating("down")}
              className={[
                "flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm transition-colors",
                rating === "down"
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : "border-border text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <ThumbsDown className="h-4 w-4" /> Needs work
            </button>
          </div>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Optional: what would make this better?"
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            disabled={!rating || sending}
            onClick={() => rating && submit(rating)}
            className="w-full mt-3 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {sending ? "Sending…" : "Send feedback"}
          </button>
        </>
      )}
    </div>
  )
}
