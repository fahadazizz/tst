"use client";

// /patients — patient index + search (Module 2, RULE 1), wired to the live API.
// Server-side search via `q`. Executing a search logs patient.search. Results
// are PatientResponse records rendered with masked identifiers (RULE 1). Uses
// the shared polished loading/empty/error states.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ScanLine,
  Search,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react";
import { MaskedIdentifier } from "@/components/design-system/MaskedIdentifier";
import { RoleGate } from "@/components/design-system/RoleGate";
import {
  ListSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/design-system/States";
import { useSession } from "@/context/session";
import { logAccess } from "@/lib/access-log";
import { patientAge } from "@/lib/format";
import {
  searchPatients,
  discoverPatientIdentities,
  type Patient,
  type PatientIdentityCandidate,
} from "@/lib/api/patients";
import { isApiError } from "@/lib/api";

export default function PatientsIndexPage() {
  const { scope } = useSession();
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");

  const [results, setResults] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastQueryWasId, setLastQueryWasId] = useState(false);
  // Org-wide candidates surfaced when an identifier lookup finds nothing at
  // this facility — otherwise a patient registered elsewhere silently reads
  // as "not found" instead of a discoverable duplicate.
  const [elsewhereCandidates, setElsewhereCandidates] = useState<
    PatientIdentityCandidate[]
  >([]);

  const reqId = useRef(0);
  // runSearch is memoized with an empty dep array below (its identity must
  // stay stable across renders, since the mount effect depends on it) — a
  // ref keeps it reading the *current* scope instead of closing over
  // whatever scope existed at the one render that created the callback.
  // Updated in an effect, not during render — refs aren't for render-time
  // reads/writes.
  const scopeRef = useRef(scope);
  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  const runSearch = useCallback(async (q: string, isId: boolean) => {
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    setLastQueryWasId(isId);
    setElsewhereCandidates([]);
    try {
      const data = await searchPatients({ q: q || undefined });
      if (myReq !== reqId.current) return;
      setResults(data);
      if (isId && data.length === 0 && q.trim().length >= 3) {
        try {
          // Distinct from patient.search — the backend logs this as its own
          // org-wide patient.identity_discovery audit event (facility_id
          // null by design), not a facility-scoped patient.search row.
          logAccess("patient.identity_discovery", {
            user_id: scopeRef.current.user_id,
            organisation_id: scopeRef.current.organisation_id,
          });
          const candidates = await discoverPatientIdentities({ q: q.trim() });
          if (myReq === reqId.current) setElsewhereCandidates(candidates);
        } catch {
          // Best-effort — the primary search result already stands.
        }
      }
    } catch (e) {
      if (myReq !== reqId.current) return;
      setError(
        isApiError(e)
          ? e.code === "PERMISSION_DENIED"
            ? "You don't have permission to view patients."
            : e.message
          : "Couldn't load patients. Please try again.",
      );
      setResults([]);
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => runSearch("", false));
  }, [runSearch]);

  const submitName = (e: React.FormEvent) => {
    e.preventDefault();
    const q = name.trim();
    if (!q) return;
    logAccess("patient.search", {
      query_type: "name",
      user_id: scope.user_id,
      organisation_id: scope.organisation_id,
      facility_id: scope.active_facility_id,
    });
    runSearch(q, false);
  };

  const submitIdentifier = (e: React.FormEvent) => {
    e.preventDefault();
    const q = identifier.trim();
    if (!q) return;
    logAccess("patient.search", {
      query_type: "identifier",
      user_id: scope.user_id,
      organisation_id: scope.organisation_id,
      facility_id: scope.active_facility_id,
    });
    runSearch(q, true);
  };

  const showingAll = !name.trim() && !identifier.trim();

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight text-ink">
            Patients
          </h1>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            Master patient index for this facility
          </p>
        </div>
        <RoleGate scope={scope} permission="patient.register">
          <Link
            href="/patients/new"
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <UserPlus size={15} />
            Register patient
          </Link>
        </RoleGate>
      </div>

      {/* Search */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <form onSubmit={submitName}>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Search by name
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 transition-colors focus-within:border-brand">
            <Search size={15} className="shrink-0 text-ink-3" />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name or free text…"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-3 focus:outline-none"
            />
          </div>
          <p className="mt-1 text-[11px] text-ink-3">Press Enter to search</p>
        </form>

        <form onSubmit={submitIdentifier}>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Look up by identifier
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 transition-colors focus-within:border-brand">
            <ScanLine size={15} className="shrink-0 text-ink-3" />
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Full CNIC / passport / MRN…"
              className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-ink-3 focus:outline-none"
            />
          </div>
          <p className="mt-1 text-[11px] text-ink-3">Exact value</p>
        </form>
      </div>

      {/* Results */}
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            {showingAll ? "All patients" : "Search results"}
          </span>
          {!loading && !error && (
            <span className="text-[11px] text-ink-3">
              {results.length} {results.length === 1 ? "patient" : "patients"}
            </span>
          )}
        </div>

        {loading ? (
          <ListSkeleton rows={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => runSearch("", false)} />
        ) : results.length === 0 ? (
          <EmptyState
            icon={Users}
            title={
              lastQueryWasId
                ? "No patient matches that identifier"
                : showingAll
                  ? "No patients yet"
                  : "No matches found"
            }
            description={
              showingAll
                ? "Register your first patient to get started."
                : "Try a different name or check the identifier."
            }
            action={
              showingAll ? (
                <RoleGate scope={scope} permission="patient.register">
                  <Link
                    href="/patients/new"
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white hover:opacity-90"
                  >
                    <UserPlus size={15} /> Register patient
                  </Link>
                </RoleGate>
              ) : undefined
            }
          />
        ) : (
          results.map((p) => (
            <Link
              key={p.patient_id}
              href={`/patients/${p.patient_id}`}
              className="flex items-center gap-3 border-b border-line px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-2"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-[12px] font-semibold text-brand">
                {(p.full_name || "?").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
                  <span className="truncate">{p.full_name}</span>
                  {p.is_deceased && (
                    <span className="shrink-0 rounded bg-alert-tint px-1.5 py-0.5 text-[10px] font-medium text-alert">
                      Deceased
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-3">
                  {p.date_of_birth ? `${patientAge(p.date_of_birth)} yrs · ` : ""}
                  <span className="capitalize">{p.gender}</span>
                  {p.city && <> · {p.city}</>}
                </div>
              </div>
              <MaskedIdentifier
                allowReveal={false}
                label="MRN"
                identifier={{
                  identifier_value: p.mrn,
                  patient_id: p.patient_id,
                  organisation_id: p.organisation_id,
                }}
              />
              <ChevronRight size={16} className="shrink-0 text-ink-3" />
            </Link>
          ))
        )}
      </div>

      {elsewhereCandidates.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-alert-line bg-alert-tint">
          <div className="flex items-start gap-2.5 border-b border-alert-line px-4 py-2.5">
            <ShieldAlert size={15} className="mt-0.5 shrink-0 text-alert" />
            <div>
              <div className="text-[12.5px] font-semibold text-alert">
                Possible existing patient at another facility
              </div>
              <p className="mt-0.5 text-[11.5px] text-[#7a2135]">
                No match at your active facility, but this identifier is close
                to {elsewhereCandidates.length === 1 ? "a record" : "records"}{" "}
                registered elsewhere in your organisation. Open one to confirm
                (a clinical reason will be required).
              </p>
            </div>
          </div>
          {elsewhereCandidates.map((c) => (
            <Link
              key={c.patient_id}
              href={`/patients/${c.patient_id}`}
              className="flex items-center gap-3 border-b border-alert-line/50 px-4 py-3 transition-colors last:border-b-0 hover:bg-white/40"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink">{c.full_name}</div>
                <div className="mt-0.5 text-[11.5px] text-ink-3">
                  {c.date_of_birth ? `${patientAge(c.date_of_birth)} yrs · ` : ""}
                  <span className="capitalize">{c.gender}</span>
                  {c.masked_cnic && <> · {c.masked_cnic}</>}
                  {c.masked_phone && <> · {c.masked_phone}</>}
                </div>
              </div>
              <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10.5px] font-medium capitalize text-ink-2">
                {c.confidence_level} match
              </span>
              <ChevronRight size={16} className="shrink-0 text-ink-3" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
