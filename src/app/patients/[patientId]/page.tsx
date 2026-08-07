"use client";

// /patients/[patientId] — patient record (Module 2). Real data via getPatient.
// A richer, calmer detail view: identity header with avatar, organized info
// sections (demographics, contact, clinical basics), and a clinical-activity
// area that will fill as consultations/orders accrue. Masked identifiers per
// RULE 1. Sparse real fields are shown as "—" rather than hidden, so the record
// reads as complete.

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Droplet,
  Cake,
  User,
  Globe,
  Briefcase,
  Heart,
  Stethoscope,
  Pill,
  CalendarClock,
  ShieldAlert,
  Loader2,
  Building2,
  FileText,
  ClipboardList,
  ReceiptText,
} from "lucide-react";
import { MaskedIdentifier } from "@/components/design-system/MaskedIdentifier";
import { Loading, ErrorState } from "@/components/design-system/States";
import { ConsentsPanel } from "@/components/patient/ConsentsPanel";
import { InsurancePanel } from "@/components/patient/InsurancePanel";
import { EmergencyContactsPanel } from "@/components/patient/EmergencyContactsPanel";
import { PatientTabs } from "@/components/patient/PatientTabs";
import { formatDateTime, patientAge } from "@/lib/format";
import {
  getPatient,
  getPatientAllergies,
  getPatientMedications,
  listPatientDocuments,
  listPatientFacilityLinks,
  type Patient,
  type Allergy,
  type PatientMedication,
  type PatientDocument,
  type PatientFacilityLink,
} from "@/lib/api/patients";
import {
  listPatientAppointments,
  listPatientReferrals,
  listPatientTasks,
  type Appointment,
  type FollowUpTask,
  type Referral,
} from "@/lib/api/operations";
import {
  getPatientOutstanding,
  listPatientInvoices,
  type Invoice,
  type PatientOutstanding,
} from "@/lib/api/billing";
import { isApiError, ApiError } from "@/lib/api";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import { logAccess } from "@/lib/access-log";

/** True only for the specific "patient not linked to your active facility,
 *  needs a reason" case — distinct from a real permission-denied (missing
 *  patient_mpi:patient:read) 403, which also uses PERMISSION_DENIED but
 *  carries no such details.reason. */
function needsCrossFacilityReason(e: unknown): e is ApiError {
  return (
    isApiError(e) &&
    e.code === "PERMISSION_DENIED" &&
    (e.details as { reason?: string } | null)?.reason ===
      "cross_facility_access_reason_required"
  );
}

export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = use(params);
  const { scope } = useSession();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsReason, setNeedsReason] = useState(false);
  const [reason, setReason] = useState("");
  const [submittingReason, setSubmittingReason] = useState(false);

  const load = async (accessReason?: string) => {
    setLoading(true);
    setError(null);
    setNeedsReason(false);
    try {
      const p = await getPatient(patientId, accessReason);
      setPatient(p);
      if (accessReason) {
        logAccess("cross_facility.access", {
          user_id: scope.user_id,
          organisation_id: scope.organisation_id,
          facility_id: scope.active_facility_id,
          patient_id: patientId,
          reason: accessReason,
        });
      }
    } catch (e) {
      if (needsCrossFacilityReason(e)) {
        setNeedsReason(true);
      } else {
        setError(
          isApiError(e)
            ? e.httpStatus === 404
              ? "This patient record could not be found."
              : e.code === "PERMISSION_DENIED"
                ? "You don't have permission to view this patient."
                : e.message
            : "Couldn't load the patient record.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void load(undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  async function submitReason(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 10) {
      setError("Please enter at least 10 characters explaining the clinical reason.");
      return;
    }
    setSubmittingReason(true);
    setError(null);
    await load(reason.trim());
    setSubmittingReason(false);
  }

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-6">
      <Link
        href="/patients"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} /> All patients
      </Link>

      {loading ? (
        <div className="mt-4 rounded-xl border border-line bg-surface">
          <Loading label="Loading patient record…" />
        </div>
      ) : needsReason ? (
        <div className="mt-4 rounded-xl border border-line bg-surface p-5">
          <div className="mb-3 flex items-start gap-2.5">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-alert" />
            <div>
              <div className="text-[13.5px] font-semibold text-ink">
                Cross-facility access
              </div>
              <p className="mt-0.5 text-[12.5px] text-ink-2">
                This patient isn&apos;t registered at your active facility.
                Enter a clinical reason (at least 10 characters) to continue —
                this access will be logged.
              </p>
            </div>
          </div>
          {error && (
            <div className="mb-3 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
              {error}
            </div>
          )}
          <form onSubmit={submitReason} className="flex flex-col gap-3">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              autoFocus
              placeholder="e.g. Patient referred from another facility for follow-up consultation"
              className="w-full resize-y rounded-lg border border-line-2 bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
            />
            <button
              type="submit"
              disabled={submittingReason}
              className="inline-flex w-fit items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {submittingReason && <Loader2 size={14} className="animate-spin" />}
              Continue
            </button>
          </form>
        </div>
      ) : error ? (
        <div className="mt-4 rounded-xl border border-line bg-surface">
          <ErrorState message={error} />
        </div>
      ) : patient ? (
        <PatientRecord patient={patient} />
      ) : null}
    </div>
  );
}

function PatientRecord({ patient: p }: { patient: Patient }) {
  const fullName = p.full_name || "Unknown patient";
  const age = p.date_of_birth ? patientAge(p.date_of_birth) : null;

  return (
    <div className="mt-4 flex flex-col gap-4">
      {/* Identity header */}
      <div className="flex flex-wrap items-start gap-4 rounded-2xl border border-line bg-surface p-5">
        <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-brand-tint text-[22px] font-semibold text-brand">
          {fullName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[20px] font-semibold tracking-tight text-ink">
              {fullName}
            </h1>
            {p.is_deceased ? (
              <span className="rounded-full bg-alert-tint px-2 py-0.5 text-[11px] font-medium text-alert">
                Deceased
              </span>
            ) : (
              <span className="rounded-full bg-approved-tint px-2 py-0.5 text-[11px] font-medium text-approved">
                Active
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-2">
            {age !== null && <span>{age} years</span>}
            <span className="capitalize">{p.gender}</span>
            {p.blood_group && <span>Blood group {p.blood_group}</span>}
            {p.city && <span>{p.city}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <MaskedIdentifier
            allowReveal
            label="MRN"
            identifier={{
              identifier_value: p.mrn,
              patient_id: p.patient_id,
              organisation_id: p.organisation_id,
            }}
          />
          {p.cnic && (
            <MaskedIdentifier
              allowReveal
              label="CNIC"
              identifier={{
                identifier_value: p.cnic,
                patient_id: p.patient_id,
                organisation_id: p.organisation_id,
              }}
            />
          )}
        </div>
      </div>

      <PatientTabs
        tabs={[
            {
              key: "overview",
              label: "Overview",
              panel: (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <InfoCard title="Demographics">
                    <Field icon={Cake} label="Date of birth" value={p.date_of_birth} />
                    <Field icon={User} label="Gender" value={p.gender} capitalize />
                    <Field icon={Droplet} label="Blood group" value={p.blood_group} />
                    <Field
                      icon={Heart}
                      label="Marital status"
                      value={p.marital_status}
                      capitalize
                    />
                    <Field icon={Briefcase} label="Occupation" value={p.occupation} />
                    <Field
                      icon={Globe}
                      label="Preferred language"
                      value={p.preferred_language}
                    />
                  </InfoCard>

                  <InfoCard title="Contact">
                    <Field icon={Phone} label="Phone" value={p.phone_number} mono />
                    <Field icon={Mail} label="Email" value={p.email} />
                    <Field icon={MapPin} label="Address" value={p.address} />
                    <Field icon={MapPin} label="City" value={p.city} />
                    <Field
                      icon={MapPin}
                      label="Province"
                      value={p.state_province}
                    />
                    <Field icon={MapPin} label="Country" value={p.country} />
                  </InfoCard>

                  <InfoCard title="Record">
                    <Field
                      icon={User}
                      label="Identity status"
                      value={p.identity_status}
                      capitalize
                    />
                    <Field
                      icon={CalendarClock}
                      label="Registered"
                      value={p.created_at ? p.created_at.slice(0, 10) : null}
                    />
                    <Field
                      icon={CalendarClock}
                      label="Last updated"
                      value={p.updated_at ? p.updated_at.slice(0, 10) : null}
                    />
                  </InfoCard>
                </div>
              ),
            },
            {
              key: "clinical",
              label: "Clinical",
              panel: <ClinicalHistory patientId={p.patient_id} />,
            },
            {
              key: "intake",
              label: "Intake",
              panel: (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <InsurancePanel patientId={p.patient_id} />
                    <EmergencyContactsPanel patientId={p.patient_id} />
                  </div>
                  <ConsentsPanel patientId={p.patient_id} />
                </div>
              ),
            },
            {
              key: "activity",
              label: "Activity",
              panel: <PatientActivity patientId={p.patient_id} />,
            },
        ]}
      />
    </div>
  );
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {title}
      </h2>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  mono,
  capitalize,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value?: string | null;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={14} className="mt-0.5 shrink-0 text-ink-3" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-ink-3">{label}</div>
        <div
          className={`text-[13px] text-ink ${mono ? "font-mono" : ""} ${
            capitalize ? "capitalize" : ""
          }`}
        >
          {value || <span className="text-ink-3">—</span>}
        </div>
      </div>
    </div>
  );
}

function PatientActivity({ patientId }: { patientId: string }) {
  const { scope } = useSession();
  const canReadAppointments = hasPermission(scope, "appointment.read");
  const canReadTasks = hasPermission(scope, "task.read");
  const canReadReferrals = hasPermission(scope, "referral.read");
  const canReadInvoices = hasPermission(scope, "invoice.read");

  const [facilityLinks, setFacilityLinks] = useState<PatientFacilityLink[]>([]);
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [outstanding, setOutstanding] = useState<PatientOutstanding | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [
        linksResult,
        documentsResult,
        appointmentsResult,
        tasksResult,
        referralsResult,
        invoicesResult,
        outstandingResult,
      ] = await Promise.allSettled([
        listPatientFacilityLinks(patientId),
        listPatientDocuments(patientId),
        canReadAppointments ? listPatientAppointments(patientId) : Promise.resolve([]),
        canReadTasks ? listPatientTasks(patientId) : Promise.resolve([]),
        canReadReferrals ? listPatientReferrals(patientId) : Promise.resolve([]),
        canReadInvoices ? listPatientInvoices(patientId) : Promise.resolve([]),
        canReadInvoices ? getPatientOutstanding(patientId) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (linksResult.status === "fulfilled") setFacilityLinks(linksResult.value);
      if (documentsResult.status === "fulfilled") setDocuments(documentsResult.value);
      if (appointmentsResult.status === "fulfilled") {
        setAppointments(appointmentsResult.value);
      }
      if (tasksResult.status === "fulfilled") setTasks(tasksResult.value);
      if (referralsResult.status === "fulfilled") setReferrals(referralsResult.value);
      if (invoicesResult.status === "fulfilled") setInvoices(invoicesResult.value);
      if (outstandingResult.status === "fulfilled") {
        setOutstanding(outstandingResult.value);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    canReadAppointments,
    canReadInvoices,
    canReadReferrals,
    canReadTasks,
    patientId,
  ]);

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">Patient activity</h2>
          <p className="text-[11.5px] text-ink-3">
            Facility links, documents, appointments, follow-ups, referrals, and billing
          </p>
        </div>
        {loading && <Loader2 size={15} className="animate-spin text-ink-3" />}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ActivityPanel
          icon={Building2}
          title="Facility links"
          count={facilityLinks.length}
          empty="No Facility links found."
        >
          {facilityLinks.slice(0, 4).map((link) => (
            <ActivityRow
              key={link.id}
              title={`Facility ${link.facility_id.slice(0, 8)}…`}
              meta={[
                link.is_active ? "Active" : "Inactive",
                link.local_registration_number
                  ? `Local ${link.local_registration_number}`
                  : null,
                link.registered_at ? formatDateTime(link.registered_at) : null,
              ]}
            />
          ))}
        </ActivityPanel>

        <ActivityPanel
          icon={FileText}
          title="Documents"
          count={documents.length}
          empty="No documents registered."
        >
          {documents.slice(0, 4).map((document) => (
            <ActivityRow
              key={document.document_id}
              title={document.document_name}
              meta={[
                document.document_type,
                document.file_format?.toUpperCase() ?? null,
                document.uploaded_at ? formatDateTime(document.uploaded_at) : null,
              ]}
            />
          ))}
        </ActivityPanel>

        {canReadAppointments && (
          <ActivityPanel
            icon={CalendarClock}
            title="Appointments"
            count={appointments.length}
            empty="No appointments found."
          >
            {appointments.slice(0, 4).map((appointment) => (
              <ActivityRow
                key={appointment.appointment_id}
                title={appointment.appointment_type}
                meta={[
                  appointment.status,
                  appointment.appointment_datetime
                    ? formatDateTime(appointment.appointment_datetime)
                    : null,
                ]}
              />
            ))}
          </ActivityPanel>
        )}

        {canReadTasks && (
          <ActivityPanel
            icon={ClipboardList}
            title="Follow-up tasks"
            count={tasks.length}
            empty="No follow-up tasks found."
          >
            {tasks.slice(0, 4).map((task) => (
              <ActivityRow
                key={task.task_id}
                title={task.instruction}
                meta={[task.status, task.due_date ? `Due ${task.due_date}` : null]}
              />
            ))}
          </ActivityPanel>
        )}

        {canReadReferrals && (
          <ActivityPanel
            icon={Stethoscope}
            title="Referrals"
            count={referrals.length}
            empty="No referrals found."
          >
            {referrals.slice(0, 4).map((referral) => (
              <ActivityRow
                key={referral.referral_id}
                title={referral.reason}
                meta={[referral.status, referral.urgency, referral.created_at?.slice(0, 10)]}
              />
            ))}
          </ActivityPanel>
        )}

        {canReadInvoices && (
          <ActivityPanel
            icon={ReceiptText}
            title="Billing summary"
            count={invoices.length}
            empty="No invoices found."
            summary={
              outstanding
                ? `${outstanding.currency} ${outstanding.outstanding_amount} outstanding`
                : undefined
            }
          >
            {invoices.slice(0, 4).map((invoice) => (
              <ActivityRow
                key={invoice.invoice_id}
                title={`${invoice.currency} ${invoice.total_amount}`}
                meta={[invoice.status, invoice.created_at.slice(0, 10)]}
              />
            ))}
          </ActivityPanel>
        )}
      </div>
    </div>
  );
}

function ActivityPanel({
  icon: Icon,
  title,
  count,
  empty,
  summary,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  count: number;
  empty: string;
  summary?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-brand-tint text-brand">
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-ink">{title}</div>
          {summary && <div className="text-[11.5px] text-ink-3">{summary}</div>}
        </div>
        <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10.5px] font-medium text-ink-3">
          {count}
        </span>
      </div>
      {count === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[12px] text-ink-3">
          {empty}
        </div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

function ActivityRow({ title, meta }: { title: string; meta: (string | null)[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <div className="truncate text-[12.5px] font-medium text-ink">{title}</div>
      <div className="mt-0.5 truncate text-[11.5px] text-ink-3">
        {meta.filter(Boolean).join(" · ") || "—"}
      </div>
    </div>
  );
}
function ClinicalHistory({ patientId }: { patientId: string }) {
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [meds, setMeds] = useState<PatientMedication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [a, m] = await Promise.allSettled([
        getPatientAllergies(patientId),
        getPatientMedications(patientId),
      ]);
      if (cancelled) return;
      if (a.status === "fulfilled") setAllergies(a.value);
      if (m.status === "fulfilled") setMeds(m.value);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const activeMeds = meds.filter((m) => m.is_active !== false);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Allergies */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-center gap-2">
          <Heart size={15} className="text-alert" />
          <h2 className="text-[13px] font-semibold text-ink">Allergies</h2>
          {!loading && allergies.length > 0 && (
            <span className="rounded-full bg-alert-tint px-2 py-0.5 text-[10.5px] font-medium text-alert">
              {allergies.length}
            </span>
          )}
        </div>
        {loading ? (
          <div className="text-[12.5px] text-ink-3">Loading…</div>
        ) : allergies.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-2 px-3 py-4 text-center text-[12px] text-ink-3">
            No known allergies on record.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {allergies.map((a) => (
              <div
                key={a.allergy_id}
                className="flex items-start justify-between gap-2 rounded-lg border border-alert-line bg-alert-tint px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink">
                    {a.allergen}
                  </div>
                  {a.reaction && (
                    <div className="text-[11.5px] text-ink-2">{a.reaction}</div>
                  )}
                </div>
                {a.severity && (
                  <span className="shrink-0 rounded bg-alert/10 px-1.5 py-0.5 text-[10.5px] font-medium capitalize text-alert">
                    {a.severity}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Medications */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-center gap-2">
          <Pill size={15} className="text-brand" />
          <h2 className="text-[13px] font-semibold text-ink">
            Current medications
          </h2>
          {!loading && activeMeds.length > 0 && (
            <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[10.5px] font-medium text-brand">
              {activeMeds.length}
            </span>
          )}
        </div>
        {loading ? (
          <div className="text-[12.5px] text-ink-3">Loading…</div>
        ) : activeMeds.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-2 px-3 py-4 text-center text-[12px] text-ink-3">
            No active medications on record.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {activeMeds.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-line px-3 py-2"
              >
                <div className="text-[13px] font-medium text-ink">
                  {m.medication_name}
                  {m.strength && (
                    <span className="ml-1 text-ink-2">{m.strength}</span>
                  )}
                </div>
                <div className="text-[11.5px] text-ink-3">
                  {[m.dosage, m.frequency, m.route].filter(Boolean).join(" · ") ||
                    "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
