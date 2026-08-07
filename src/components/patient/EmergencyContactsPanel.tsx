"use client";

// EmergencyContactsPanel.tsx — self-fetching list of a patient's emergency
// contacts, with a compact add form. Wired to the real
// /patient-mpi/insurance-consent/patients/{id}/emergency-contacts endpoints.

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  addEmergencyContact,
  listEmergencyContacts,
  type EmergencyContact,
} from "@/lib/api/insurance-consent";
import { RoleGate } from "@/components/design-system/RoleGate";
import { useSession } from "@/context/session";
import { isApiError } from "@/lib/api";

export function EmergencyContactsPanel({ patientId }: { patientId: string }) {
  const { scope } = useSession();
  const [items, setItems] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listEmergencyContacts(patientId));
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't load emergency contacts.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4.5 py-3.5">
        <h2 className="text-sm font-semibold text-ink">Emergency contacts</h2>
        <RoleGate scope={scope} permission="emergency_contact.write">
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-line-2 bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-ink-2 hover:bg-surface-2"
          >
            <Plus size={13} /> Add contact
          </button>
        </RoleGate>
      </div>

      {error && (
        <div className="border-b border-alert-line bg-alert-tint px-4.5 py-2 text-[12px] text-alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="px-4.5 py-6 text-center text-[12.5px] text-ink-2">Loading…</div>
      ) : items.length === 0 ? (
        <div className="grid place-items-center px-6 py-10 text-center text-[13px] text-ink-2">
          No emergency contacts on record.
        </div>
      ) : (
        <ul>
          {items.map((c) => (
            <li
              key={c.contact_id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4.5 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink">
                  {c.contact_name}
                  {c.is_primary && (
                    <span className="ml-1.5 rounded bg-brand-tint px-1.5 py-0.5 text-[10px] font-medium text-brand">
                      Primary
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-3">
                  {c.relationship} · {c.phone_number}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formOpen && (
        <AddContactForm
          patientId={patientId}
          onClose={() => setFormOpen(false)}
          onAdded={() => {
            setFormOpen(false);
            load();
          }}
        />
      )}
    </section>
  );
}

function AddContactForm({
  patientId,
  onClose,
  onAdded,
}: {
  patientId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim() && relationship.trim() && phone.trim();

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await addEmergencyContact(patientId, {
        contact_name: name.trim(),
        relationship: relationship.trim(),
        phone_number: phone.trim(),
        is_primary: isPrimary,
      });
      onAdded();
    } catch (err) {
      setError(
        isApiError(err)
          ? err.message
          : "Couldn't add the contact.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/30 px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
        <div className="flex items-center gap-2 border-b border-line px-4.5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">Add emergency contact</h2>
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
              Name <span className="text-alert">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-line-2 bg-surface px-2.5 py-2 text-[13px] text-ink focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
              Relationship <span className="text-alert">*</span>
            </label>
            <input
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="e.g. Spouse"
              className="w-full rounded-lg border border-line-2 bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
              Phone <span className="text-alert">*</span>
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+923001234567"
              className="w-full rounded-lg border border-line-2 bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
            />
            Primary contact
          </label>
        </div>

        <div className="flex items-center gap-2.5 border-t border-line px-4.5 py-3">
          <button
            type="button"
            onClick={submit}
            disabled={!canSave || busy}
            className="rounded-lg border border-brand bg-brand px-3.5 py-2 text-[12.5px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
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
