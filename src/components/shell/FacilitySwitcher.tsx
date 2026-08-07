"use client";

// FacilitySwitcher.tsx
// RULE 3 — facility context switcher. A user with roles at more than one
// facility can change which facility they are working in; everything scoped
// downstream (lists, permissions) keys off the active facility. When the user
// holds a role at only one facility, this is a static label, not a control.

import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useSession } from "@/context/session";

export function FacilitySwitcher() {
  const { activeFacility, availableFacilities, switchFacility } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const multi = availableFacilities.length > 1;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative mb-3.5">
      <button
        type="button"
        disabled={!multi}
        onClick={() => multi && setOpen((v) => !v)}
        aria-haspopup={multi ? "listbox" : undefined}
        aria-expanded={multi ? open : undefined}
        className={`flex w-full items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-left transition-colors ${
          multi ? "cursor-pointer hover:border-line-2" : "cursor-default"
        }`}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-tint text-brand">
          <Building2 size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] leading-tight text-ink-3">
            Facility
          </span>
          <span className="block truncate text-[12.5px] font-medium text-ink">
            {activeFacility.facility_name}
          </span>
        </span>
        {multi && <ChevronsUpDown size={15} className="shrink-0 text-ink-3" />}
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg shadow-slate-900/5"
        >
          {availableFacilities.map((f) => {
            const active = f.facility_id === activeFacility.facility_id;
            return (
              <li key={f.facility_id} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    switchFacility(f.facility_id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-ink">
                      {f.facility_name}
                    </span>
                    <span className="block font-mono text-[11px] text-ink-3">
                      {f.facility_code} · {f.city}
                    </span>
                  </span>
                  {active && (
                    <Check size={15} className="shrink-0 text-brand" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
