"use client";

// staff/permissions/page.tsx — spec §9.7: permission catalogue, read-only.
//
// Not the grant/revoke editor — that lives on /staff/roles' create/edit
// dialogs now that the backend exposes GET /roles/{id}/permissions, per
// Fahad's explicit ask for checkboxes built into the role form rather than
// a separate page next to it. This screen stays a read-only browser of the
// full catalogue, useful as a reference when deciding what to grant.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, ChevronDown } from "lucide-react";
import {
  listPermissionCatalogue,
  type Permission,
} from "@/lib/api/rbac";
import { Loading, ErrorState } from "@/components/design-system/States";

export default function PermissionCataloguePage() {
  const [permissions, setPermissions] = useState<Permission[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  function reload() {
    setLoading(true);
    setLoadError(null);
    listPermissionCatalogue()
      .then(setPermissions)
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    queueMicrotask(reload);
  }, []);

  // Group by top_level_domain, then by module_name, per spec's explicit
  // instruction.
  const grouped = new Map<string, Map<string, Permission[]>>();
  for (const p of permissions ?? []) {
    const domain = p.top_level_domain ?? "Other";
    const moduleName = p.module_name;
    if (!grouped.has(domain)) grouped.set(domain, new Map());
    const domainGroup = grouped.get(domain)!;
    if (!domainGroup.has(moduleName)) domainGroup.set(moduleName, []);
    domainGroup.get(moduleName)!.push(p);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Link
        href="/staff"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
      >
        <ArrowLeft size={13} /> Back to Staff accounts
      </Link>
      <h1 className="text-[20px] font-semibold tracking-tight text-ink">
        Permission catalogue
      </h1>
      <p className="mt-1 text-[13px] text-ink-2">
        Every permission this Organisation&apos;s roles can be granted. Read-only
        reference — grant/revoke happens per role.
      </p>

      <div className="mt-6">
        {loading && <Loading label="Loading permission catalogue…" />}
        {!loading && Boolean(loadError) && <ErrorState error={loadError} onRetry={reload} />}
        {!loading && !loadError && (
          <div className="flex flex-col gap-4">
            {[...grouped.entries()].map(([domain, modules]) => (
              <section key={domain} className="rounded-xl border border-line bg-surface p-5">
                <h2 className="text-[14.5px] font-semibold text-ink">{domain}</h2>
                <div className="mt-3 flex flex-col gap-3">
                  {[...modules.entries()].map(([moduleName, perms]) => (
                    <div key={moduleName}>
                      <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">
                        {moduleName}
                      </h3>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {perms.map((p) => (
                          <PermissionRow key={p.permission_id} permission={p} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PermissionRow({ permission }: { permission: Permission }) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <li className="rounded-lg border border-line-2 px-3 py-2">
      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-tint text-brand">
          <KeyRound size={12} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
          {permission.display_name ?? permission.permission_name}
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-ink-3 transition-transform ${showDetails ? "rotate-180" : ""}`}
        />
      </button>
      {showDetails && (
        <div className="mt-1.5 pl-8 text-[11px] text-ink-3">
          <div className="font-mono">{permission.permission_name}</div>
          {permission.description && <div className="mt-0.5">{permission.description}</div>}
        </div>
      )}
    </li>
  );
}
