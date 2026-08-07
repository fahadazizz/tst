"use client";

// SearchBar.tsx
// Global patient search in the top bar. Debounced live search against the MPI
// (searchPatients), with a results dropdown that navigates to the patient record.
// ⌘K / Ctrl-K focuses it. Results are keyboard- and mouse-navigable.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, CornerDownLeft } from "lucide-react";
import { searchPatients, type Patient } from "@/lib/api/patients";
import { patientAge } from "@/lib/format";

export function SearchBar() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const reqId = useRef(0);

  // ⌘K / Ctrl-K to focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Close on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Debounced search.
  const doSearch = useCallback(async (query: string) => {
    const myReq = ++reqId.current;
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await searchPatients({ q: query.trim(), limit: 6 });
      if (myReq !== reqId.current) return;
      setResults(data);
      setActive(0);
    } catch {
      if (myReq === reqId.current) setResults([]);
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(q), 250);
    return () => clearTimeout(t);
  }, [q, doSearch]);

  function go(p: Patient) {
    setOpen(false);
    setQ("");
    setResults([]);
    router.push(`/patients/${p.patient_id}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = results[active];
      if (p) go(p);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative min-w-0 flex-1 max-w-md">
      <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2 transition-colors focus-within:border-brand focus-within:bg-surface">
        <Search size={15} className="shrink-0 text-ink-3" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => q && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search patients by name or CNIC…"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-3 focus:outline-none"
        />
        {loading ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-ink-3" />
        ) : (
          <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-line-2 bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-3 sm:flex">
            ⌘K
          </kbd>
        )}
      </div>

      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg shadow-slate-900/5">
          {loading && results.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12.5px] text-ink-3">
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12.5px] text-ink-3">
              No patients match &ldquo;{q.trim()}&rdquo;
            </div>
          ) : (
            <>
              {results.map((p, i) => (
                <button
                  key={p.patient_id}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(p)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    i === active ? "bg-surface-2" : ""
                  }`}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-tint text-[11px] font-semibold text-brand">
                    {(p.full_name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-ink">
                      {p.full_name}
                    </span>
                    <span className="block truncate text-[11px] text-ink-3">
                      {p.date_of_birth ? `${patientAge(p.date_of_birth)} yrs · ` : ""}
                      <span className="capitalize">{p.gender}</span>
                      {p.mrn ? ` · ${p.mrn}` : ""}
                    </span>
                  </span>
                  {i === active && (
                    <CornerDownLeft size={13} className="shrink-0 text-ink-3" />
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
