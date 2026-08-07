// lib/queueStatus.ts — formats a QueueEntry into the human-readable label
// the appointments board shows inline after "Check in and queue" succeeds
// (appointments/page.tsx). Extracted so it's testable without jsdom (this
// repo's vitest is pure-logic only) and so the appointments row and the
// success toast can share one extraction instead of each picking fields
// independently.

import type { QueueEntry } from "@/lib/api/operations";

export function formatQueueStatus(entry: QueueEntry): string {
  const position = entry.queue_token || `#${entry.queue_position}`;
  const status = entry.entry_status.replace(/_/g, " ");
  const wait =
    entry.estimated_wait_minutes != null
      ? ` · ~${entry.estimated_wait_minutes} min`
      : "";
  return `Queue ${position} · ${status}${wait}`;
}
