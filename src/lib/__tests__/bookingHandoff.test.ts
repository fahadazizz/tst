import { describe, it, expect } from "vitest";
import { resolveBookingPatients } from "@/lib/bookingHandoff";
import type { Patient } from "@/lib/api/patients";

function makePatient(id: string, name: string): Patient {
  return { patient_id: id, full_name: name } as Patient;
}

describe("resolveBookingPatients", () => {
  it("selects the handoff patient, not the first search result (the bug this replaces)", () => {
    const searchResults = [makePatient("existing-1", "Alice"), makePatient("existing-2", "Bob")];
    const handoff = makePatient("new-patient", "Carol");
    const { selectedPatientId } = resolveBookingPatients(searchResults, handoff);
    expect(selectedPatientId).toBe("new-patient");
  });

  it("puts the handoff patient first in the list, ahead of search results", () => {
    const searchResults = [makePatient("existing-1", "Alice")];
    const handoff = makePatient("new-patient", "Carol");
    const { patients } = resolveBookingPatients(searchResults, handoff);
    expect(patients.map((p) => p.patient_id)).toEqual(["new-patient", "existing-1"]);
  });

  it("does not depend on the handoff patient appearing in the search results at all", () => {
    // The real-world case this guards: a just-registered patient has no
    // ordering guarantee of showing up in an arbitrary 100-row search page.
    const searchResults = [makePatient("existing-1", "Alice"), makePatient("existing-2", "Bob")];
    const handoff = makePatient("brand-new", "Dana");
    const { patients, selectedPatientId } = resolveBookingPatients(searchResults, handoff);
    expect(selectedPatientId).toBe("brand-new");
    expect(patients.some((p) => p.patient_id === "brand-new")).toBe(true);
  });

  it("dedupes when the handoff patient is also present in the search results", () => {
    const handoff = makePatient("shared-id", "Carol");
    const searchResults = [makePatient("existing-1", "Alice"), makePatient("shared-id", "Carol")];
    const { patients } = resolveBookingPatients(searchResults, handoff);
    expect(patients.filter((p) => p.patient_id === "shared-id")).toHaveLength(1);
    expect(patients).toHaveLength(2);
  });

  it("falls back to the first search result when there is no handoff patient (documents pre-existing behavior)", () => {
    const searchResults = [makePatient("existing-1", "Alice"), makePatient("existing-2", "Bob")];
    const { selectedPatientId } = resolveBookingPatients(searchResults, null);
    expect(selectedPatientId).toBe("existing-1");
  });

  it("selects nothing when there is no handoff patient and search results are empty", () => {
    const { patients, selectedPatientId } = resolveBookingPatients([], null);
    expect(patients).toEqual([]);
    expect(selectedPatientId).toBe("");
  });

  it("still selects the handoff patient even when search results are empty", () => {
    const handoff = makePatient("new-patient", "Carol");
    const { patients, selectedPatientId } = resolveBookingPatients([], handoff);
    expect(patients).toEqual([handoff]);
    expect(selectedPatientId).toBe("new-patient");
  });
});
