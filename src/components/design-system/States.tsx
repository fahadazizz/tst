"use client";

// States.tsx — shared, polished loading / empty / error states used across the
// app so every screen feels finished and consistent. Built on the existing
// design tokens (surface, line, ink, brand). Keep these calm and quiet; they
// frame content, they don't compete with it.

import type { ReactNode } from "react";
import { Loader2, TriangleAlert, RefreshCw } from "lucide-react";
import { classifyError, defaultMessageFor, isRetryable } from "@/lib/errors";

/* ── Skeleton primitives ─────────────────────────────────────────── */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-surface-2 ${className}`}
      style={{ background: "linear-gradient(90deg,#f1f4f8,#e9edf3,#f1f4f8)" }}
    />
  );
}

/** A skeleton that mimics a list of rows — use while a list is loading. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-surface-2 text-ink-3">
        <Icon size={22} />
      </span>
      <div className="text-[14px] font-medium text-ink">{title}</div>
      {description && (
        <div className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-2">
          {description}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ── Error state ─────────────────────────────────────────────────── */

export function ErrorState({
  title,
  message,
  error,
  onRetry,
}: {
  title?: string;
  /** Explicit message wins; if omitted and `error` is given, a message is
   *  derived per spec §7.14's shared classification (lib/errors.ts) —
   *  branching on error.code/httpStatus, not generic text, so a 409 vs a
   *  500 vs a 429 read differently even with no per-screen copy at all. */
  message?: string;
  error?: unknown;
  /** Explicit prop wins; if omitted and `error` is given, the retry button
   *  only shows for retryable kinds (500/503) — retrying a 422 or 409
   *  unchanged just fails the same way again. */
  onRetry?: () => void;
}) {
  const resolvedMessage = message ?? (error !== undefined ? defaultMessageFor(error) : "");
  const resolvedTitle =
    title ??
    (error !== undefined && classifyError(error) === "permission_denied"
      ? "Access denied"
      : "Something went wrong");
  const showRetry = onRetry && (error === undefined || isRetryable(error));
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-alert-tint text-alert">
        <TriangleAlert size={22} />
      </span>
      <div className="text-[14px] font-medium text-ink">
        {resolvedTitle}
      </div>
      <div className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-2">
        {resolvedMessage}
      </div>
      {showRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
        >
          <RefreshCw size={14} /> Try again
        </button>
      )}
    </div>
  );
}

/* ── Inline centered loader (small, for quick loads) ─────────────── */

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-12 text-[13px] text-ink-2">
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  );
}
