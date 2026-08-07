// format.ts
// Presentation helpers. Dates/times must display in the ACTIVE FACILITY's
// timezone, not the viewer's browser timezone and not a hardcoded constant —
// a receptionist in one timezone must see the same operational day/time as
// a doctor in another, both anchored to the facility they're working in.
//
// setActiveTimeZone() is called by SessionProvider whenever the active
// Facility resolves/changes (real value from Facility.timezone, always
// present per the backend schema). Until that first resolves, this falls
// back to the VIEWER's own timezone rather than a fixed one — a real backend
// value not being loaded yet should read as "same as your clock" rather
// than silently pretending everyone is in Asia/Karachi.

import type { ISODate, ISODateTime } from "@/types/schema";

let activeTimeZone: string =
  typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : "UTC";

/** Called by SessionProvider on Facility resolve/switch. */
export function setActiveTimeZone(timeZone: string | null | undefined): void {
  if (timeZone) activeTimeZone = timeZone;
}

export function getActiveTimeZone(): string {
  return activeTimeZone;
}

export function formatDate(iso: ISODateTime | ISODate): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: activeTimeZone,
  }).format(new Date(iso));
}

export function formatTime(iso: ISODateTime): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: activeTimeZone,
  }).format(new Date(iso));
}

export function formatDateTime(iso: ISODateTime): string {
  return `${formatDate(iso)}, ${formatTime(iso)}`;
}

// YYYY-MM-DD in the active Facility's timezone. Used for "same operational
// day" comparisons (e.g. queue token_number resets daily) that must not
// shift with the viewer's local timezone.
export function zonedDateKey(iso: ISODateTime): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: activeTimeZone,
  }).format(new Date(iso));
}

/** The active Facility's real UTC offset (e.g. "+05:00") on a given date —
 *  computed from the IANA zone name rather than hardcoded, so it's correct
 *  across DST boundaries for zones that observe it. Used to build
 *  timezone-aware ISO datetimes for the backend from a facility-local
 *  wall-clock date+time the user entered (spec: never send ambiguous local
 *  datetime strings). */
export function utcOffsetString(date: Date, timeZone: string = activeTimeZone): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const match = raw.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return "+00:00";
  const [, sign, hh, mm] = match;
  return `${sign}${hh.padStart(2, "0")}:${(mm ?? "00").padStart(2, "0")}`;
}

/** Combine a facility-local wall-clock date+time (from a <input type="date">
 *  / <input type="time"> pair) into a timezone-aware ISO datetime using the
 *  facility's real offset — not the browser's. "09:15" typed by a
 *  receptionist means 09:15 at the facility, regardless of where their
 *  browser happens to be. */
export function facilityLocalISO(
  date: string,
  time: string,
  timeZone: string = activeTimeZone,
): string {
  const offset = utcOffsetString(new Date(`${date}T${time}:00Z`), timeZone);
  return `${date}T${time}:00${offset}`;
}

// Age in whole years. Computed server-side against the current date, so there
// is no client/server hydration drift.
export function patientAge(dob: ISODate, ref: Date = new Date()): number {
  const birth = new Date(dob);
  let age = ref.getFullYear() - birth.getFullYear();
  const monthDelta = ref.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && ref.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

// Monday (YYYY-MM-DD) of the week containing `dateKey`, offset by whole
// weeks. Operates on the date-only string (paired with zonedDateKey at the
// call site) so calendar-day math never drifts with the viewer's local
// timezone — Asia/Karachi has no DST, so a fixed +05:00 offset is exact.
export function mondayOf(dateKey: string, weekOffset = 0): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday + weekOffset * 7);
  return d.toISOString().slice(0, 10);
}

export function addDays(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function initials(name: string): string {
  return name
    .replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
