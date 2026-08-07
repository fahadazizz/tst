// TokenDisplay.tsx
// Large-format "now serving" board — the display a waiting room screen would
// show. Deliberately a dark, high-contrast panel (unlike the rest of the app's
// light surfaces) since that's how real clinic token boards read from across a
// room. Shows the currently CALLED token and the next 3 WAITING, by token
// number, at the active facility.

import type { QueueEntry } from "@/types/schema";

export function TokenDisplay({
  entries,
  facilityName,
}: {
  entries: QueueEntry[];
  facilityName: string;
}) {
  const called = entries
    .filter((e) => e.status === "called")
    .sort((a, b) => a.token_number - b.token_number)[0];

  const nextWaiting = entries
    .filter((e) => e.status === "waiting")
    .sort((a, b) => a.token_number - b.token_number)
    .slice(0, 3);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-ink text-white">
      <div className="border-b border-white/10 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-white/60">
        {facilityName} · Outpatient queue
      </div>

      <div className="px-5 py-8 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/50">
          Now serving
        </div>
        <div className="mt-2 font-mono text-7xl font-semibold tabular-nums">
          {called ? String(called.token_number).padStart(2, "0") : "—"}
        </div>
        {!called && (
          <p className="mt-2 text-[12px] text-white/50">
            No token currently being called
          </p>
        )}
      </div>

      <div className="border-t border-white/10 px-5 py-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">
          Next up
        </div>
        {nextWaiting.length === 0 ? (
          <p className="text-[12.5px] text-white/50">No one else waiting.</p>
        ) : (
          <div className="flex items-center gap-3">
            {nextWaiting.map((e, i) => (
              <div
                key={e.queue_entry_id}
                className={`grid flex-1 place-items-center gap-1 rounded-lg border border-white/10 py-3 ${
                  i === 0 ? "bg-white/10" : "bg-white/5"
                }`}
              >
                <span className="font-mono text-2xl font-medium tabular-nums">
                  {String(e.token_number).padStart(2, "0")}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-white/50">
                  waiting
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
