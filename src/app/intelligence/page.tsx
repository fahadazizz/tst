"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  askIntelligence,
  executeIntelligenceTool,
  getIntelligenceDashboard,
  listIntelligenceTools,
  type IntelligenceDashboard,
  type NaturalLanguageQuery,
  type ToolDefinition,
  type ToolExecution,
} from "@/lib/api/intelligence";
import { isApiError } from "@/lib/api";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import { zonedDateKey, addDays } from "@/lib/format";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/design-system/States";
import { StatusBadge } from "@/components/design-system/StatusBadge";
import { ExecutionCard } from "@/components/intelligence/ExecutionCard";
import { BarChart3, Loader2, Play, RefreshCw, Search } from "lucide-react";

type Scope = "facility" | "organisation";

// Facility-local calendar day, not UTC's — see appointments/page.tsx for why.
function today() {
  return zonedDateKey(new Date().toISOString());
}

function daysAgo(days: number) {
  return addDays(today(), -days);
}

export default function IntelligencePage() {
  const { scope } = useSession();
  const canRead = hasPermission(scope, "intelligence.read");
  const canOrg = hasPermission(scope, "intelligence.organisation");
  const [dateFrom, setDateFrom] = useState(daysAgo(7));
  const [dateTo, setDateTo] = useState(today());
  const [queryScope, setQueryScope] = useState<Scope>("facility");
  const [limit, setLimit] = useState("50");
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [dashboard, setDashboard] = useState<IntelligenceDashboard | null>(null);
  const [selectedTool, setSelectedTool] = useState("");
  const [toolResult, setToolResult] = useState<ToolExecution | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<NaturalLanguageQuery | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      scope: queryScope,
      limit: Math.max(1, Math.min(500, Number(limit) || 50)),
    }),
    [dateFrom, dateTo, limit, queryScope],
  );

  const load = useCallback(async () => {
    if (!canRead) return;
    if (queryScope === "organisation" && !canOrg) {
      setError("You don't have permission for organisation-scope analytics.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [toolList, dashboardResult] = await Promise.all([
        listIntelligenceTools(),
        getIntelligenceDashboard(params),
      ]);
      setTools(toolList);
      setSelectedTool((current) => current || toolList[0]?.tool_name || "");
      setDashboard(dashboardResult);
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't load intelligence data.");
    } finally {
      setLoading(false);
    }
  }, [canOrg, canRead, params, queryScope]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  async function runTool() {
    if (!selectedTool) return;
    setLoading(true);
    setError(null);
    try {
      setToolResult(await executeIntelligenceTool(selectedTool, params));
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't execute tool.");
    } finally {
      setLoading(false);
    }
  }

  async function ask() {
    if (question.trim().length < 3) return;
    setLoading(true);
    setError(null);
    try {
      setAnswer(
        await askIntelligence({
          ...params,
          question: question.trim(),
          conversation_id: answer?.conversation_id ?? null,
        }),
      );
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't answer the question.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-5 px-6 py-6">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight text-ink">Intelligence</h1>
        <p className="mt-0.5 text-[12.5px] text-ink-2">
          Deterministic analytics tools, dashboard sections, and grounded ask
        </p>
      </div>

      {!canRead ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ErrorState
            title="Access denied"
            message="You don't have permission to view intelligence."
          />
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="grid gap-3 md:grid-cols-[150px_150px_150px_100px_auto] md:items-end">
              <DateInput label="From" value={dateFrom} onChange={setDateFrom} />
              <DateInput label="To" value={dateTo} onChange={setDateTo} />
              <label>
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  Scope
                </span>
                <select
                  value={queryScope}
                  onChange={(e) => setQueryScope(e.target.value as Scope)}
                  className="h-10 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
                >
                  <option value="facility">Facility</option>
                  <option value="organisation" disabled={!canOrg}>
                    Organisation
                  </option>
                </select>
              </label>
              <TextInput label="Limit" value={limit} onChange={setLimit} />
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-3.5 text-[12.5px] font-medium text-white disabled:opacity-60"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Refresh
              </button>
            </div>
            {error && <div className="mt-3 text-[12px] text-alert">{error}</div>}
          </section>

          {loading && !dashboard ? (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <ListSkeleton rows={4} />
            </div>
          ) : dashboard ? (
            <section className="grid gap-4 lg:grid-cols-3">
              {Object.entries(dashboard.sections).map(([name, section]) => (
                <ExecutionCard key={name} result={section} fallbackName={name} />
              ))}
            </section>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <EmptyState icon={BarChart3} title="No dashboard loaded" />
            </div>
          )}

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="mb-3 text-[13px] font-semibold text-ink">Execute tool</h2>
              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <select
                  value={selectedTool}
                  onChange={(e) => setSelectedTool(e.target.value)}
                  className="h-10 rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
                >
                  {tools.map((tool) => (
                    <option key={tool.tool_name} value={tool.tool_name}>
                      {tool.tool_name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={runTool}
                  disabled={!selectedTool || loading}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-3.5 text-[12.5px] font-medium text-white disabled:opacity-50"
                >
                  <Play size={14} /> Run
                </button>
              </div>
              {toolResult && <div className="mt-3"><ExecutionCard result={toolResult} /></div>}
            </div>

            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="mb-3 text-[13px] font-semibold text-ink">Ask</h2>
              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask about operations, billing, lab, queues..."
                  className="h-10 rounded-lg border border-line-2 bg-surface px-3 text-[13px] text-ink outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={ask}
                  disabled={question.trim().length < 3 || loading}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-3.5 text-[12.5px] font-medium text-white disabled:opacity-50"
                >
                  <Search size={14} /> Ask
                </button>
              </div>
              {answer && (
                <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <StatusBadge tone={answer.status === "answered" ? "approved" : "warning"}>
                      {answer.status}
                    </StatusBadge>
                    <StatusBadge tone={answer.capability_level === "llm" ? "active" : "neutral"}>
                      {answer.capability_level}
                    </StatusBadge>
                    {answer.degradation_reason && (
                      <StatusBadge tone="warning">{answer.degradation_reason}</StatusBadge>
                    )}
                  </div>
                  <div className="text-[13px] text-ink">{answer.answer}</div>
                  <div className="mt-2 text-[11.5px] text-ink-3">
                    Tools: {answer.tools.join(", ") || "-"}
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
      />
    </label>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
      />
    </label>
  );
}
