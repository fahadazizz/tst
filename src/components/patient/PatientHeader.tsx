// PatientHeader.tsx
// Patient identity band: avatar, name (+ Urdu), demographics, and the high-risk
// identifiers (MRN + CNIC) masked by default via MaskedIdentifier (RULE 1).
// Reveal is a single-record, in-focus action and is logged inside that
// component. A presentational tab strip mirrors the design preview.

import type { Patient, PatientIdentifier } from "@/types/schema";
import { MaskedIdentifier } from "@/components/design-system/MaskedIdentifier";
import { initials, patientAge } from "@/lib/format";

const LANGUAGE_LABEL: Record<Patient["preferred_language"], string> = {
  en: "English",
  ur: "Urdu",
};

const REGISTRATION_LABEL: Record<Patient["registration_source"], string> = {
  walk_in: "walk-in",
  appointment: "appointment",
  referral: "referral",
  import: "import",
};

export function PatientHeader({
  patient,
  identifiers,
}: {
  patient: Patient;
  identifiers: PatientIdentifier[];
}) {
  const visibleIds = identifiers.filter((i) => i.patient_id === patient.patient_id);

  return (
    <section className="rounded-xl border border-line bg-surface px-5 py-4">
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid size-[52px] shrink-0 place-items-center rounded-[14px] bg-brand text-lg font-semibold text-white">
          {initials(`${patient.first_name} ${patient.last_name}`)}
        </span>

        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-ink">
            {patient.first_name} {patient.last_name}
            {patient.name_urdu && (
              <span className="text-sm font-normal text-ink-3" lang="ur">
                {patient.name_urdu}
              </span>
            )}
          </h1>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-2">
            <span>
              <b className="font-medium text-ink">
                {patientAge(patient.date_of_birth)} yrs
              </b>{" "}
              · <span className="capitalize">{patient.gender}</span>
            </span>
            {patient.blood_group && (
              <span>
                Blood group{" "}
                <b className="font-medium text-ink">{patient.blood_group}</b>
              </span>
            )}
            <span>
              Registered{" "}
              <b className="font-medium text-ink">
                {REGISTRATION_LABEL[patient.registration_source]}
              </b>
            </span>
            <span>
              Preferred language{" "}
              <b className="font-medium text-ink">
                {LANGUAGE_LABEL[patient.preferred_language]}
              </b>
            </span>
          </div>
        </div>

        <div className="ml-auto flex flex-col items-end gap-1.5">
          <div className="rounded-md border border-line bg-surface-2 px-2.5 py-1">
            <MaskedIdentifier
              label="MRN"
              identifier={{
                identifier_value: patient.mrn,
                patient_id: patient.patient_id,
                organisation_id: patient.organisation_id,
              }}
              logContext={{ field: "mrn" }}
            />
          </div>
          {visibleIds.map((id) => (
            <div
              key={id.identifier_id}
              className="rounded-md border border-line bg-surface-2 px-2.5 py-1"
            >
              <MaskedIdentifier identifier={id} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
