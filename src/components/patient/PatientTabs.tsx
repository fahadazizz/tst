"use client";

// PatientTabs.tsx
// Tab strip for the patient record. Panels are passed in as pre-rendered slots
// (server components from the page) and only the active one is mounted — so an
// audit-logging panel (e.g. a clinical note) doesn't fire until its tab is
// actually opened.

import { useState, type ReactNode } from "react";

export interface PatientTab {
  key: string;
  label: string;
  panel: ReactNode;
}

export function PatientTabs({
  tabs,
}: {
  tabs: PatientTab[];
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const activePanel = tabs.find((tab) => tab.key === active)?.panel;

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              aria-current={on ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
                on
                  ? "border-brand text-brand"
                  : "border-transparent text-ink-2 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="mt-4">{activePanel}</div>
    </div>
  );
}
