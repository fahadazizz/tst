"use client";

// /patients/new — patient registration (Module 2), wired to the live API.
// Submits to POST /patient-mpi/mpi-core/patients. facility_id comes from the
// active session. RULE 3: gated on patient.register. On a 422 the backend
// returns per-field detail (loc: ["body","<field>"]) which we surface inline
// next to the offending field, rather than a single vague banner.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import { RoleGate } from "@/components/design-system/RoleGate";
import { useSession } from "@/context/session";
import {
  createPatient,
  discoverPatientIdentities,
  type PatientCreate,
  type PatientIdentityCandidate,
} from "@/lib/api/patients";
import { isApiError } from "@/lib/api";
import { parseValidationErrorsByField } from "@/lib/errors";
import { logAccess } from "@/lib/access-log";

export default function NewPatientPage() {
  const { scope } = useSession();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-5">
      <Link
        href="/patients"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink"
      >
        <ArrowLeft size={15} />
        Back to patients
      </Link>

      <RoleGate
        scope={scope}
        permission="patient.register"
        logDenied
        fallback={
          <div className="flex items-start gap-3 rounded-xl border border-alert-line bg-alert-tint px-4 py-4">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-alert" />
            <div>
              <div className="text-[13px] font-semibold text-alert">
                You don&apos;t have permission to register patients
              </div>
              <div className="mt-0.5 text-[12.5px] text-[#7a2135]">
                This action requires the <code>patient.register</code>{" "}
                permission (receptionist or admin).
              </div>
            </div>
          </div>
        }
      >
        <RegistrationForm />
      </RoleGate>
    </div>
  );
}

const EMPTY = {
  full_name: "",
  first_name: "",
  last_name: "",
  gender: "female" as "male" | "female" | "other",
  date_of_birth: "",
  cnic: "",
  phone_number: "",
  email: "",
  city: "",
  address: "",
  blood_group: "",
  marital_status: "",
};

function RegistrationForm() {
  const { scope } = useSession();
  const router = useRouter();

  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Per-field messages from the backend, keyed by field name.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Advisory only — never blocks registration. Org-wide, so it catches a
  // patient already registered at a DIFFERENT facility before a duplicate
  // record gets created here.
  const [duplicateCandidates, setDuplicateCandidates] = useState<
    PatientIdentityCandidate[]
  >([]);

  useEffect(() => {
    const cnic = form.cnic.trim();
    if (cnic.length < 3) {
      queueMicrotask(() => setDuplicateCandidates([]));
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const candidates = await discoverPatientIdentities({ q: cnic });
        if (!cancelled) setDuplicateCandidates(candidates);
      } catch {
        if (!cancelled) setDuplicateCandidates([]);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.cnic]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    // Clear a field's error as soon as the user edits it.
    setFieldErrors((fe) => {
      if (!fe[k]) return fe;
      const next = { ...fe };
      delete next[k];
      return next;
    });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    if (!form.full_name.trim()) {
      setFieldErrors({ full_name: "Full name is required." });
      return;
    }

    const payload: PatientCreate = {
      facility_id: scope.active_facility_id,
      full_name: form.full_name.trim(),
      gender: form.gender,
      ...(form.first_name.trim() && { first_name: form.first_name.trim() }),
      ...(form.last_name.trim() && { last_name: form.last_name.trim() }),
      ...(form.date_of_birth && { date_of_birth: form.date_of_birth }),
      ...(form.cnic.trim() && { cnic: form.cnic.trim() }),
      ...(form.phone_number.trim() && { phone_number: form.phone_number.trim() }),
      ...(form.email.trim() && { email: form.email.trim() }),
      ...(form.city.trim() && { city: form.city.trim() }),
      ...(form.address.trim() && { address: form.address.trim() }),
      ...(form.blood_group.trim() && { blood_group: form.blood_group.trim() }),
      ...(form.marital_status.trim() && { marital_status: form.marital_status.trim() }),
    } as PatientCreate;

    setBusy(true);
    try {
      const created = await createPatient(payload);
      logAccess("patient.register", {
        user_id: scope.user_id,
        organisation_id: scope.organisation_id,
        facility_id: scope.active_facility_id,
        patient_id: created.patient_id,
      });
      // Hand off straight into booking instead of dropping the receptionist
      // back on the patient list with no path forward — /appointments reads
      // these two params to pre-select this exact patient in the booking
      // modal rather than making the receptionist re-search for them.
      router.push(`/appointments?patientId=${created.patient_id}&openBooking=1`);
    } catch (err) {
      if (isApiError(err)) {
        if (err.code === "DUPLICATE_RESOURCE" || err.httpStatus === 409) {
          setFormError(
            "A patient with this CNIC already exists at this facility. Search for the existing record instead.",
          );
        } else if (err.code === "VALIDATION_SCHEMA_ERROR" || err.httpStatus === 422) {
          // Map backend field errors onto our inputs (shared parser — spec
          // §7.14's global error model, lib/errors.ts).
          const next = parseValidationErrorsByField(err.details);
          if (Object.keys(next).length > 0) {
            setFieldErrors(next);
          } else {
            setFormError("Some fields are invalid. Please review and try again.");
          }
        } else if (err.code === "PERMISSION_DENIED") {
          setFormError("You don't have permission to register patients.");
        } else {
          setFormError(err.message || "Couldn't register the patient. Please try again.");
        }
      } else {
        setFormError("Couldn't register the patient. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-ink">
          Register patient
        </h1>
        <p className="mt-0.5 text-[12.5px] text-ink-2">
          Create a new master patient record for this facility.
        </p>
      </div>

      {formError && (
        <div className="flex items-start gap-2 rounded-lg border border-alert-line bg-alert-tint px-3.5 py-2.5 text-[12.5px] text-alert">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={fieldErrors.full_name}>
            <input
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              className={inputCls(fieldErrors.full_name)}
              placeholder="e.g. Ayesha Ahmed"
            />
          </Field>

          <Field label="Gender" required error={fieldErrors.gender}>
            <select
              value={form.gender}
              onChange={(e) => set("gender", e.target.value as typeof form.gender)}
              className={inputCls(fieldErrors.gender)}
            >
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </Field>

          <Field label="First name" error={fieldErrors.first_name}>
            <input
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
              className={inputCls(fieldErrors.first_name)}
            />
          </Field>

          <Field label="Last name" error={fieldErrors.last_name}>
            <input
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
              className={inputCls(fieldErrors.last_name)}
            />
          </Field>

          <Field label="Date of birth" error={fieldErrors.date_of_birth}>
            <input
              type="date"
              value={form.date_of_birth}
              onChange={(e) => set("date_of_birth", e.target.value)}
              className={inputCls(fieldErrors.date_of_birth)}
            />
          </Field>

          <Field label="CNIC" hint="Format: xxxxx-xxxxxxx-x" error={fieldErrors.cnic}>
            <input
              value={form.cnic}
              onChange={(e) => set("cnic", e.target.value)}
              className={`${inputCls(fieldErrors.cnic)} font-mono`}
              placeholder="35202-1234567-8"
            />
          </Field>

          <Field label="Phone" hint="International: +923001234567" error={fieldErrors.phone_number}>
            <input
              value={form.phone_number}
              onChange={(e) => set("phone_number", e.target.value)}
              className={inputCls(fieldErrors.phone_number)}
              placeholder="+923001234567"
            />
          </Field>

          <Field label="Email" error={fieldErrors.email}>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className={inputCls(fieldErrors.email)}
            />
          </Field>

          <Field label="City" error={fieldErrors.city}>
            <input
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              className={inputCls(fieldErrors.city)}
            />
          </Field>

          <Field label="Blood group" error={fieldErrors.blood_group}>
            <input
              value={form.blood_group}
              onChange={(e) => set("blood_group", e.target.value)}
              className={inputCls(fieldErrors.blood_group)}
              placeholder="O+"
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Address" error={fieldErrors.address}>
              <input
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                className={inputCls(fieldErrors.address)}
              />
            </Field>
          </div>
        </div>
      </div>

      {duplicateCandidates.length > 0 && (
        <div className="rounded-xl border border-alert-line bg-alert-tint p-4">
          <div className="flex items-start gap-2.5">
            <ShieldAlert size={16} className="mt-0.5 shrink-0 text-alert" />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold text-alert">
                Possible existing patient found
              </div>
              <p className="mt-0.5 text-[11.5px] text-[#7a2135]">
                This CNIC is close to{" "}
                {duplicateCandidates.length === 1 ? "a record" : "records"}{" "}
                already in your organisation — check before registering a
                duplicate.
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {duplicateCandidates.map((c) => (
                  <li key={c.patient_id}>
                    <Link
                      href={`/patients/${c.patient_id}`}
                      className="text-[12px] font-medium text-brand hover:underline"
                    >
                      {c.full_name}
                    </Link>{" "}
                    <span className="text-[11px] text-ink-3">
                      ({c.confidence_level} match
                      {c.masked_cnic ? ` · ${c.masked_cnic}` : ""})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Link
          href="/patients"
          className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Register patient
        </button>
      </div>
    </form>
  );
}

function inputCls(error?: string): string {
  return `w-full rounded-lg border bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand ${
    error ? "border-alert" : "border-line-2"
  }`;
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-ink-2">
        {label}
        {required && <span className="text-alert"> *</span>}
      </span>
      {children}
      {error ? (
        <span className="text-[11px] text-alert">{error}</span>
      ) : hint ? (
        <span className="text-[11px] text-ink-3">{hint}</span>
      ) : null}
    </label>
  );
}
