import { describe, it, expect } from "vitest";
import { formatQueueStatus } from "@/lib/queueStatus";
import type { QueueEntry } from "@/lib/api/operations";

function makeEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    entry_id: "entry-uuid-1234",
    queue_id: "queue-uuid-5678",
    organisation_id: "org-1",
    facility_id: "fac-1",
    appointment_id: "appt-1",
    visit_id: "visit-1",
    patient_id: "patient-1",
    queue_token: "",
    queue_position: 3,
    priority: "normal",
    entry_status: "waiting",
    estimated_wait_minutes: 12,
    ...overrides,
  } as QueueEntry;
}

describe("formatQueueStatus", () => {
  it("uses queue_token when present", () => {
    expect(formatQueueStatus(makeEntry({ queue_token: "A12" }))).toBe(
      "Queue A12 · waiting · ~12 min",
    );
  });

  it("falls back to #queue_position when queue_token is empty", () => {
    expect(formatQueueStatus(makeEntry({ queue_token: "", queue_position: 3 }))).toBe(
      "Queue #3 · waiting · ~12 min",
    );
  });

  it("omits the wait segment when estimated_wait_minutes is null", () => {
    expect(
      formatQueueStatus(makeEntry({ queue_token: "A12", estimated_wait_minutes: null })),
    ).toBe("Queue A12 · waiting");
  });

  it("humanizes underscored entry_status values", () => {
    expect(
      formatQueueStatus(
        makeEntry({ queue_token: "A12", entry_status: "in_consultation", estimated_wait_minutes: null }),
      ),
    ).toBe("Queue A12 · in consultation");
  });

  it("regression: no longer renders the old raw-UUID shape", () => {
    const entry = makeEntry({ queue_token: "A12" });
    const output = formatQueueStatus(entry);
    expect(output).not.toContain(entry.queue_id.slice(0, 8));
    expect(output).not.toContain(entry.entry_id.slice(0, 8));
    expect(output).not.toMatch(/^Queue .{8} · Entry/);
  });
});
