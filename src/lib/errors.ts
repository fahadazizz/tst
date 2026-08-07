// lib/errors.ts
// Shared error-classification pattern (spec §7.14): branch primarily on
// error.code/httpStatus, not human message text, so every screen handles
// 422/401/403/409/423/429/500/503 consistently instead of collapsing every
// failure into one generic toast. Screens still own their own copy where the
// raw backend message isn't appropriate to show verbatim — this module is
// the classification + field-parsing plumbing, not a UI component.

import { ApiError } from "@/lib/api";

export type ErrorKind =
  | "validation"
  | "auth"
  | "permission_denied"
  | "not_found"
  | "conflict"
  | "locked"
  | "rate_limited"
  | "server_error"
  | "unknown";

/** Classifies by httpStatus first (the spec's explicit instruction), not by
 *  matching on `code` or message text — those vary per endpoint, the status
 *  codes don't. */
export function classifyError(err: unknown): ErrorKind {
  if (!(err instanceof ApiError)) return "unknown";
  switch (err.httpStatus) {
    case 422:
      return "validation";
    case 401:
      return "auth";
    case 403:
      return "permission_denied";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 423:
      return "locked";
    case 429:
      return "rate_limited";
    case 500:
    case 503:
      return "server_error";
    default:
      return "unknown";
  }
}

/** 500/503 are the only kinds worth an automatic retry affordance — a 422
 *  or 409 retried unchanged will just fail the same way again. */
export function isRetryable(err: unknown): boolean {
  return classifyError(err) === "server_error";
}

export interface ValidationFieldError {
  field: string;
  message: string;
}

// Backend validation detail entry, straight from FastAPI/Pydantic:
// { type: "missing", loc: ["body", "cnic"], msg: "Field required", input: ... }
interface RawValidationDetail {
  loc?: (string | number)[];
  msg?: string;
}

/** Backend messages sometimes come prefixed "Value error, ..." (Pydantic
 *  validator wrapping) — strip that for display. */
function cleanValidationMessage(msg: string): string {
  return msg.replace(/^Value error,\s*/i, "");
}

/** Parses a 422's `error.details` (FastAPI/Pydantic's raw validation-error
 *  list) into a flat field→message list a form can key its per-field error
 *  display off of. `loc` is a path like `["body", "cnic"]` or, for nested
 *  fields, `["body", "items", 0, "dose"]` — the field key used here is
 *  always the last segment, since that's what forms key their own field
 *  names by; a full dotted path is available by joining `loc` yourself if a
 *  screen ever needs to disambiguate nested duplicates. */
export function parseValidationErrors(details: unknown): ValidationFieldError[] {
  if (!Array.isArray(details)) return [];
  const out: ValidationFieldError[] = [];
  for (const raw of details as RawValidationDetail[]) {
    if (!raw || typeof raw !== "object") continue;
    const loc = Array.isArray(raw.loc) ? raw.loc : [];
    const field = loc.length > 0 ? String(loc[loc.length - 1]) : "value";
    if (typeof raw.msg === "string") {
      out.push({ field, message: cleanValidationMessage(raw.msg) });
    }
  }
  return out;
}

/** Same as `parseValidationErrors`, but keyed by field name — the common
 *  case (map straight onto `Record<fieldName, errorText>` form state). Later
 *  entries win if the backend ever reports the same field twice. */
export function parseValidationErrorsByField(details: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { field, message } of parseValidationErrors(details)) {
    out[field] = message;
  }
  return out;
}

/** A short, safe, user-facing default per error kind — not a substitute for
 *  screen-specific copy (e.g. "This CNIC already exists" beats a generic
 *  conflict message), but a reasonable fallback so no screen has to
 *  hand-roll one from scratch. */
export function defaultMessageFor(err: unknown): string {
  const kind = classifyError(err);
  const raw = err instanceof ApiError ? err.message : undefined;
  switch (kind) {
    case "validation":
      return "Please check the highlighted fields and try again.";
    case "auth":
      return "Your session has expired. Please sign in again.";
    case "permission_denied":
      return "You don't have permission to do that.";
    case "not_found":
      return raw || "That couldn't be found.";
    case "conflict":
      return raw || "This conflicts with a recent change. Please refresh and try again.";
    case "locked":
      return raw || "This account is temporarily locked. Please try again later.";
    case "rate_limited":
      return raw || "Too many attempts. Please wait a moment and try again.";
    case "server_error":
      return "Something went wrong on our end. Please try again in a moment.";
    default:
      return raw || "Something went wrong. Please try again.";
  }
}
