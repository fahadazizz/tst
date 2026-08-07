"use client";

// ReferralsBoard.tsx
// Incoming referrals pending acceptance at the active facility. There is no
// backend endpoint for "all outgoing referrals sent by this facility" (only
// per-patient referral history exists), so this board only covers incoming —
// creating a new referral is still available via the "New referral" button.
//
// Accept/Decline is gated on referral.respond (operations:referral:update),
// distinct from referral.write (operations:referral:create) used to gate the
// "New referral" button — a role can hold one without the other.
//
// RULE 4 — accepting an incoming referral IS a cross-facility access event;
// it logs cross_facility.access using the referral's own `reason` as context
// (no second reason prompt needed at accept time).

import { useCallback, useEffect, useState } from "react";
import { Check, Inbox, Plus, X } from "lucide-react";
import {
  createReferral,
  expireReferral,
  listPendingReferrals,
  respondToReferral,
  type Referral,
  type ReferralCreate,
} from "@/lib/api/operations";
import { listFacilities, type Facility } from "@/lib/api/tenant";
import { getPatient, searchPatients, type Patient } from "@/lib/api/patients";
import { MaskedIdentifier } from "@/components/design-system/MaskedIdentifier";
import { StatusBadge, type BadgeTone } from "@/components/design-system/StatusBadge";
import { RoleGate } from "@/components/design-system/RoleGate";
import { useSession } from "@/context/session";
import { isApiError } from "@/lib/api";
import { logAccess } from "@/lib/access-log";
import { formatDateTime } from "@/lib/format";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/design-system/States";
import { Typeahead, type TypeaheadItem } from "./Typeahead";

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "pending",
  accepted: "approved",
  declined: "warning",
  expired: "warning",
};

export function ReferralsBoard() {
  const { scope, activeFacility } = useSession();
  const [list, setList] = useState<Referral[]>([]);
  // Referral responses only carry patient_id, not name/MRN — looked up
  // per-referral using the referral's own `reason` as the cross-facility
  // access justification (same design the accept-flow's audit log already
  // relies on). Missing on lookup failure (e.g. a too-short reason) rather
  // than failing the whole list.
  const [patientsById, setPatientsById] = useState<Record<string, Patient>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const referrals = await listPendingReferrals(activeFacility.facility_id);
      setList(referrals);
      const entries = await Promise.all(
        referrals.map(async (r) => {
          try {
            return [r.patient_id, await getPatient(r.patient_id, r.reason)] as const;
          } catch {
            return null;
          }
        }),
      );
      setPatientsById(
        Object.fromEntries(entries.filter((e): e is readonly [string, Patient] => e !== null)),
      );
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't load referrals.");
    } finally {
      setLoading(false);
    }
  }, [activeFacility.facility_id]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  async function respond(referral: Referral, status: "accepted" | "declined") {
    try {
      const updated = await respondToReferral(referral.referral_id, status);
      setList((prev) =>
        prev.map((r) => (r.referral_id === updated.referral_id ? updated : r)),
      );
      if (status === "accepted") {
        logAccess("cross_facility.access", {
          user_id: scope.user_id,
          organisation_id: scope.organisation_id,
          facility_id: scope.active_facility_id,
          patient_id: referral.patient_id,
          referred_to_facility: referral.referred_to_facility,
          referral_id: referral.referral_id,
          reason: referral.reason,
        });
      }
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't update the referral.");
    }
  }

  async function expire(referral: Referral) {
    try {
      const updated = await expireReferral(referral.referral_id);
      setList((prev) =>
        prev.map((r) => (r.referral_id === updated.referral_id ? updated : r)),
      );
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't expire the referral.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            Referrals — pending at {activeFacility.facility_name}
          </h1>
        </div>
        <RoleGate scope={scope} permission="referral.write">
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-brand bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white hover:bg-[#0c6b73]"
          >
            <Plus size={14} /> New referral
          </button>
        </RoleGate>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        {loading ? (
          <ListSkeleton rows={4} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No pending referrals"
            description={`No referrals are awaiting acceptance at ${activeFacility.facility_name}.`}
          />
        ) : (
          <ul>
            {list.map((r) => {
              const patient = patientsById[r.patient_id];
              return (
              <li
                key={r.referral_id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4.5 py-3 last:border-b-0"
              >
                <div className="min-w-[10rem]">
                  {patient ? (
                    <>
                      <div className="text-[13px] font-medium text-ink">
                        {patient.full_name}
                      </div>
                      <MaskedIdentifier
                        allowReveal={false}
                        label="MRN"
                        identifier={{
                          identifier_value: patient.mrn,
                          patient_id: patient.patient_id,
                          organisation_id: patient.organisation_id,
                        }}
                      />
                    </>
                  ) : (
                    <div className="text-[13px] text-ink-3">Patient (restricted)</div>
                  )}
                </div>

                <div className="min-w-0 flex-1 text-[12.5px] text-ink-2">{r.reason}</div>

                <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium capitalize text-ink-2">
                  {r.urgency}
                </span>

                <span className="shrink-0 text-[11px] text-ink-3">
                  {formatDateTime(r.created_at)}
                </span>

                <StatusBadge tone={STATUS_TONE[r.status] ?? "pending"}>
                  {r.status[0].toUpperCase() + r.status.slice(1)}
                </StatusBadge>

                {r.status === "pending" && (
                  <RoleGate scope={scope} permission="referral.respond">
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => respond(r, "accepted")}
                        className="inline-flex items-center gap-1 rounded-lg border border-approved bg-approved px-2.5 py-1.5 text-[11.5px] font-medium text-white hover:bg-[#036a4c]"
                      >
                        <Check size={13} /> Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => respond(r, "declined")}
                        className="inline-flex items-center gap-1 rounded-lg border border-line-2 bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-ink-2 hover:border-alert-line hover:text-alert"
                      >
                        <X size={13} /> Decline
                      </button>
                      <button
                        type="button"
                        onClick={() => expire(r)}
                        className="rounded-lg border border-line-2 bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-ink-3 hover:text-ink"
                      >
                        Expire
                      </button>
                    </div>
                  </RoleGate>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </section>

      {formOpen && (
        <NewReferralForm
          onClose={() => setFormOpen(false)}
          onCreated={() => {
            setFormOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function NewReferralForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (referral: Referral) => void;
}) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientLabel, setPatientLabel] = useState("");
  const [patientItems, setPatientItems] = useState<TypeaheadItem[]>([]);

  const [facilities, setFacilities] = useState<Facility[] | null>(null);
  const [facilitiesError, setFacilitiesError] = useState(false);
  const [toFacilityId, setToFacilityId] = useState("");

  const [reason, setReason] = useState("");
  const [urgency, setUrgency] = useState<"routine" | "urgent" | "emergency">("routine");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listFacilities()
      .then((list) => {
        if (cancelled) return;
        setFacilities(list);
        setToFacilityId(list[0]?.facility_id ?? "");
      })
      .catch(() => {
        if (!cancelled) setFacilitiesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (patientId || patientQuery.trim().length < 2) {
      queueMicrotask(() => setPatientItems([]));
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await searchPatients({ q: patientQuery.trim(), limit: 8 });
        if (!cancelled) {
          setPatientItems(
            results.map((p) => ({ key: p.patient_id, label: p.full_name, sublabel: p.mrn })),
          );
        }
      } catch {
        if (!cancelled) setPatientItems([]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patientQuery, patientId]);

  const canSave = patientId && toFacilityId && reason.trim();

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const body: Omit<ReferralCreate, "facility_id"> = {
        patient_id: patientId,
        referred_to_facility: toFacilityId,
        reason: reason.trim(),
        urgency,
      };
      const referral = await createReferral(body);
      onCreated(referral);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't create the referral.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/30 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
        <div className="flex items-center gap-2 border-b border-line px-4.5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">Refer to another facility</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid size-7 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-4.5 py-4">
          {error && (
            <div className="rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
              Patient
            </label>
            <Typeahead
              items={patientItems}
              value={patientId ? patientLabel : patientQuery}
              onChange={(v) => {
                setPatientQuery(v);
                setPatientId(null);
              }}
              onSelect={(item) => {
                setPatientId(item.key);
                setPatientLabel(item.label);
                setPatientQuery(item.label);
              }}
              placeholder="Search patients…"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
              Refer to facility
            </label>
            {facilitiesError ? (
              <div className="rounded-lg border border-alert-line bg-alert-tint px-2.5 py-2 text-[12px] text-alert">
                You don&apos;t have permission to view the facility directory — ask
                an admin to add the destination facility for you.
              </div>
            ) : (
              <select
                value={toFacilityId}
                onChange={(e) => setToFacilityId(e.target.value)}
                disabled={!facilities}
                className="w-full rounded-lg border border-line-2 bg-surface px-2.5 py-2 text-[13px] text-ink focus:border-brand focus:outline-none disabled:opacity-60"
              >
                {(facilities ?? []).map((f) => (
                  <option key={f.facility_id} value={f.facility_id}>
                    {f.facility_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
              Urgency
            </label>
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as typeof urgency)}
              className="w-full rounded-lg border border-line-2 bg-surface px-2.5 py-2 text-[13px] text-ink focus:border-brand focus:outline-none"
            >
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-2">
              Reason for cross-facility referral <span className="text-alert">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Why is this patient being referred to another facility?"
              className="w-full resize-y rounded-lg border border-line-2 bg-surface px-2.5 py-2 text-[12.5px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-t border-line px-4.5 py-3">
          <button
            type="button"
            onClick={submit}
            disabled={!canSave || busy}
            className="rounded-lg border border-brand bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create referral
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line-2 bg-surface px-3.5 py-2 text-[12.5px] font-medium text-ink-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
