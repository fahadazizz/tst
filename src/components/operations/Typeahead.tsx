"use client";

// Typeahead.tsx
// Small generic combobox shared by the Operations screens' forms — patient
// lookup (Appointments, Referrals, Tasks), doctor lookup (Appointments), and
// assignee lookup (Tasks). Shows up to 8 matches (substring, case-insensitive)
// and — with a small catalogue — shows candidates even before typing, since
// there's little to filter. Free-text entry isn't required; selecting an item
// is how the parent learns the id, not just a label string.

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

export interface TypeaheadItem {
  key: string;
  label: string;
  sublabel?: string;
}

export function Typeahead({
  items,
  value,
  onChange,
  onSelect,
  placeholder,
}: {
  items: TypeaheadItem[];
  value: string;
  onChange: (text: string) => void;
  onSelect: (item: TypeaheadItem) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const q = value.trim().toLowerCase();
  const matches = (q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items).slice(
    0,
    8
  );

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-line-2 bg-surface px-2.5 py-2 focus-within:border-brand">
        <Search size={13} className="shrink-0 text-ink-3" />
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-3 focus:outline-none"
        />
      </div>
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg shadow-slate-900/5">
          {matches.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-ink hover:bg-surface-2"
              >
                <span>{item.label}</span>
                {item.sublabel && (
                  <span className="shrink-0 text-[11px] text-ink-3">{item.sublabel}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
