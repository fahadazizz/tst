// components/intelligence/ExecutionCard.tsx
// Shared, generic renderer for a single ToolExecutionResponse (dashboard
// section or ad hoc tool run). No per-tool schema is hardcoded here, since
// new tools/fields (backend's own words: "additive-only") must keep
// working without a frontend change.
//
// Shared between /intelligence (tenant dashboard/tools) and /platform's
// per-Organisation Intelligence dashboard (spec:
// PLATFORM_CONSOLE_BACKEND_UPDATE.md item #4) rather than duplicated —
// both consume the exact same DashboardResponse/ToolExecutionResponse
// shapes, and this rendering already fixed one real bug (multi-level
// nested objects showing "[object Object]"); duplicating it risks fixing
// that bug in only one of the two places next time.

import { formatDateTime } from "@/lib/format";
import type { ToolExecution } from "@/lib/api/intelligence";
import { Brain } from "lucide-react";

// Recursively flattens any value into a compact, readable string — handles
// nesting at ANY depth, not just one level. by_ageing_bucket is genuinely
// two levels deep ({"0_30": {invoice_count, outstanding_amount}, ...}); a
// single-level unwrap renders the outer keys fine but still hits a bare
// String() on each inner object, producing "[object Object]". Recursing
// here instead of unwrapping once is what actually fixes that.
function stringifyValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "n/a";
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        item !== null && typeof item === "object"
          ? Object.entries(item as Record<string, unknown>)
              .map(([k, v]) => `${k.replaceAll("_", " ")}: ${stringifyValue(k, v)}`)
              .join(", ")
          : String(item),
      )
      .join(" | ");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k.replaceAll("_", " ")}: ${stringifyValue(k, v)}`)
      .join(", ");
  }
  if (/_rate$/.test(key) && typeof value === "number") return `${(value * 100).toFixed(1)}%`;
  if (/_pct$/.test(key) && typeof value === "number") return `${value.toFixed(1)}%`;
  return String(value);
}

// Renders any metric value generically. Three real shapes the backend
// documents that String(value) would render wrong:
//  - null: every *_change_pct/*_rate field can be null (e.g. zero-visit
//    baseline period) — must show "n/a", never "0%" or the literal "null".
//  - *_rate fields: 0.0-1.0 fractions, not already percentages.
//  - nested objects/arrays (ageing buckets, gender/age-band breakdowns,
//    daily trend points), at any depth: String() on these produces
//    "[object Object]".
function formatMetricValue(key: string, value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-ink-3">n/a</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-ink-3">none</span>;
    const shown = value.slice(0, 8);
    return (
      <div className="flex flex-col gap-1">
        {shown.map((item, i) => (
          <div key={i} className="text-[12.5px] text-ink">
            {item !== null && typeof item === "object"
              ? Object.entries(item as Record<string, unknown>)
                  .map(([k, v]) => `${k.replaceAll("_", " ")}: ${stringifyValue(k, v)}`)
                  .join(" · ")
              : String(item)}
          </div>
        ))}
        {value.length > shown.length && (
          <div className="text-[11px] text-ink-3">+{value.length - shown.length} more</div>
        )}
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <div className="flex flex-col gap-0.5">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="text-[12.5px] text-ink">
            {k.replaceAll("_", " ")}: {stringifyValue(k, v)}
          </div>
        ))}
      </div>
    );
  }
  if (/_rate$/.test(key) && typeof value === "number") {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (/_pct$/.test(key) && typeof value === "number") {
    return `${value.toFixed(1)}%`;
  }
  return String(value);
}

export function ExecutionCard({
  result,
  fallbackName,
}: {
  result: ToolExecution;
  fallbackName?: string;
}) {
  const metricEntries = Object.entries(result.metrics ?? {});
  const rows = result.rows ?? [];
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-start gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
          <Brain size={15} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-ink">
            {result.tool_name || fallbackName}
          </div>
          <div className="text-[11.5px] text-ink-3">
            {result.scope} · {formatDateTime(result.generated_at)}
          </div>
        </div>
      </div>
      <div className="grid gap-2">
        {metricEntries.length > 0 ? (
          metricEntries.map(([key, value]) => (
            <div key={key} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
              <div className="text-[11px] text-ink-3">{key.replaceAll("_", " ")}</div>
              <div className="text-[13px] font-medium text-ink">{formatMetricValue(key, value)}</div>
            </div>
          ))
        ) : (
          <div className="text-[12px] text-ink-3">No metrics returned.</div>
        )}
      </div>
      {rows.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Rows
          </div>
          <div className="flex flex-col gap-1.5">
            {rows.slice(0, 5).map((row, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] text-ink">
                {Object.entries(row)
                  .map(([k, v]) => `${k.replaceAll("_", " ")}: ${stringifyValue(k, v)}`)
                  .join(" · ")}
              </div>
            ))}
            {rows.length > 5 && (
              <div className="text-[11px] text-ink-3">+{rows.length - 5} more row(s) not shown</div>
            )}
          </div>
        </div>
      )}
      <div className="mt-2 text-[11.5px] text-ink-3">
        Rows {rows.length} · Drill-down IDs {result.drill_down_ids?.length ?? 0}
        {result.limit_applied ? " · limit applied" : ""}
      </div>
    </div>
  );
}
