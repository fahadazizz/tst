"use client";

// settings/organisation/page.tsx — spec §9.1: Organisation overview, edit,
// and deactivation (privileged users only). Organisation scope always comes
// from the authenticated token (GET/PATCH /organisation are self-scoped) —
// never accepted from frontend state, per spec's explicit rule.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Loader2, TriangleAlert } from "lucide-react";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import {
  getOrganisation,
  updateOrganisation,
  deactivateOrganisation,
  type Organisation,
  type OrganisationUpdate,
} from "@/lib/api/tenant";
import { ApiError } from "@/lib/api";
import { defaultMessageFor, parseValidationErrorsByField } from "@/lib/errors";
import { Loading, ErrorState } from "@/components/design-system/States";

export default function OrganisationSettingsPage() {
  const { scope } = useSession();
  const [org, setOrg] = useState<Organisation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    getOrganisation()
      .then((data) => !cancelled && setOrg(data))
      .catch((err) => !cancelled && setLoadError(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const canUpdate = hasPermission(scope, "organisation.update");
  const canDelete = hasPermission(scope, "organisation.delete");

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
      >
        <ArrowLeft size={13} /> Back to Settings
      </Link>
      <h1 className="text-[20px] font-semibold tracking-tight text-ink">Organisation</h1>
      <p className="mt-1 text-[13px] text-ink-2">
        Profile, contact details, and deactivation.
      </p>

      <div className="mt-6">
        {loading && <Loading label="Loading Organisation…" />}
        {!loading && Boolean(loadError) && (
          <ErrorState
            error={loadError}
            onRetry={() => {
              setLoadError(null);
              setLoading(true);
              getOrganisation()
                .then(setOrg)
                .catch(setLoadError)
                .finally(() => setLoading(false));
            }}
          />
        )}
        {!loading && !loadError && org && (
          <div className="flex flex-col gap-5">
            <OrganisationForm
              org={org}
              editable={canUpdate}
              onSaved={setOrg}
            />
            {canDelete && <DeactivateOrganisationCard org={org} />}
          </div>
        )}
      </div>
    </div>
  );
}

function OrganisationForm({
  org,
  editable,
  onSaved,
}: {
  org: Organisation;
  editable: boolean;
  onSaved: (org: Organisation) => void;
}) {
  const [form, setForm] = useState({
    organisation_name: org.organisation_name ?? "",
    organisation_type: org.organisation_type ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSaved(false);
    setBusy(true);
    try {
      const payload: OrganisationUpdate = {
        organisation_name: form.organisation_name.trim(),
        organisation_type: form.organisation_type.trim() || null,
      };
      const updated = await updateOrganisation(payload);
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.httpStatus === 422) {
        const next = parseValidationErrorsByField(err.details);
        if (Object.keys(next).length > 0) setFieldErrors(next);
        else setError("Some fields are invalid. Please review and try again.");
      } else {
        setError(defaultMessageFor(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
          <Building2 size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14.5px] font-semibold text-ink">Profile</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            {org.is_active ? "Active" : "Deactivated"}
          </p>

          {error && (
            <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3.5 py-2.5 text-[12.5px] text-alert">
              {error}
            </div>
          )}
          {saved && !error && (
            <div className="mt-3 rounded-lg border border-approved-line bg-approved-tint px-3.5 py-2.5 text-[12.5px] text-approved">
              Saved.
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">Organisation name</span>
              <input
                required
                disabled={!editable}
                minLength={2}
                maxLength={255}
                value={form.organisation_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, organisation_name: e.target.value }))
                }
                className={`rounded-lg border bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60 ${
                  fieldErrors.organisation_name ? "border-alert" : "border-line-2"
                }`}
              />
              {fieldErrors.organisation_name && (
                <span className="text-[11.5px] text-alert">
                  {fieldErrors.organisation_name}
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">
                Organisation type
              </span>
              <input
                disabled={!editable}
                maxLength={50}
                value={form.organisation_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, organisation_type: e.target.value }))
                }
                placeholder="e.g. hospital, clinic chain"
                className="rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60 placeholder:text-ink-3"
              />
            </label>
            {editable && (
              <button
                type="submit"
                disabled={busy}
                className="mt-1 flex items-center justify-center gap-2 self-start rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Save changes
              </button>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

function DeactivateOrganisationCard({ org }: { org: Organisation }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDeactivate() {
    setError(null);
    setBusy(true);
    try {
      await deactivateOrganisation(org.organisation_id);
      router.push("/settings");
    } catch (err) {
      setError(defaultMessageFor(err));
      setBusy(false);
    }
  }

  if (!org.is_active) return null;

  return (
    <section className="rounded-xl border border-alert-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-alert-tint text-alert">
          <TriangleAlert size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14.5px] font-semibold text-ink">Deactivate Organisation</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            This deactivates the entire Organisation and every Facility, user, and
            session within it. This is not reversible from this screen.
          </p>
          {error && (
            <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3.5 py-2.5 text-[12.5px] text-alert">
              {error}
            </div>
          )}
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-4 rounded-lg border border-alert-line px-3.5 py-2 text-[12.5px] font-medium text-alert transition-colors hover:bg-alert-tint"
            >
              Deactivate Organisation
            </button>
          ) : (
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={busy}
                className="flex items-center justify-center gap-2 rounded-lg bg-alert px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Confirm deactivation
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
