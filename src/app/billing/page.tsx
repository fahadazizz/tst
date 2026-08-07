"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  authorizeDiscount,
  createInvoice,
  downloadReceipt,
  getBillingException,
  getBillingLeakage,
  getDailyReconciliation,
  getInvoice,
  getPatientOutstanding,
  getPaymentMethodSummary,
  getReceipt,
  getVisitInvoiceSummary,
  listPatientInvoices,
  recordPayment,
  refundPayment,
  voidInvoice,
  type BillingException,
  type BillingLeakage,
  type BillingLeakageCandidate,
  type DailyReconciliation,
  type Invoice,
  type PatientOutstanding,
  type Payment,
  type PaymentMethodSummary,
  type Receipt,
  type Refund,
  type VisitInvoiceSummary,
} from "@/lib/api/billing";
import { isApiError } from "@/lib/api";
import { searchPatients } from "@/lib/api/patients";
import { useSession } from "@/context/session";
import { hasPermission } from "@/lib/permissions";
import { formatDateTime, zonedDateKey, addDays } from "@/lib/format";
import { Typeahead, type TypeaheadItem } from "@/components/operations/Typeahead";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/design-system/States";
import { StatusBadge, type BadgeTone } from "@/components/design-system/StatusBadge";
import {
  ArchiveX,
  Banknote,
  CreditCard,
  FilePlus2,
  Loader2,
  ReceiptText,
  RefreshCw,
  Search,
  TicketPercent,
  TriangleAlert,
  Undo2,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";

type TabKey = "reports" | "invoice" | "patient" | "visit" | "receipt";

const STATUS_TONE: Record<string, BadgeTone> = {
  unpaid: "pending",
  partially_paid: "active",
  paid: "approved",
  void: "warning",
};

// Facility-local calendar day, not UTC's — see appointments/page.tsx for why.
function today() {
  return zonedDateKey(new Date().toISOString());
}

function daysAgo(days: number) {
  return addDays(today(), -days);
}

function makeIdempotencyKey(prefix: string) {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

function money(amount: string | number | null | undefined, currency = "PKR") {
  return `${currency} ${amount ?? "0.00"}`;
}

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingPageInner />
    </Suspense>
  );
}

function BillingPageInner() {
  const { scope } = useSession();
  const canRead = hasPermission(scope, "invoice.read");
  const router = useRouter();
  const searchParams = useSearchParams();
  // Handoff from the consultation workspace's "Resolve pricing exception"
  // link (PostConsultationBilling, consultations/[consultationId]/page.tsx)
  // — lands here already on Reports with this visit's leakage row (if
  // still within the default date range) highlighted and its resolution
  // modal opened automatically, instead of making staff re-find it.
  const [highlightVisitId] = useState(() => searchParams.get("visitId"));
  const [tab, setTab] = useState<TabKey>("reports");
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [lastPayment, setLastPayment] = useState<Payment | null>(null);
  const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null);
  const [lastRefund, setLastRefund] = useState<Refund | null>(null);
  // Seeded from a leakage row with no exception (completed_visit_without_
  // invoice) — the manual-invoice path still needs a human amount/
  // description, but shouldn't make staff retype what's already on screen.
  const [manualPrefill, setManualPrefill] = useState<{
    patientId: string;
    visitId: string;
  } | null>(null);

  useEffect(() => {
    if (highlightVisitId) {
      router.replace("/billing");
    }
    // Consume the handoff param once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-5 px-6 py-6">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight text-ink">
          Billing
        </h1>
        <p className="mt-0.5 text-[12.5px] text-ink-2">
          Reports, known-record lookups, invoice actions, payments, and refunds
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-surface p-1.5">
        {[
          ["reports", "Reports"],
          ["invoice", "Invoice"],
          ["patient", "Patient"],
          ["visit", "Visit"],
          ["receipt", "Receipt"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key as TabKey)}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium ${
              tab === key
                ? "bg-brand text-white"
                : "text-ink-3 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!canRead ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ErrorState
            title="Access denied"
            message="You don't have permission to view billing records."
          />
        </div>
      ) : (
        <>
          {tab === "reports" && (
            <ReportsPanel
              highlightVisitId={highlightVisitId}
              onResolved={setActiveInvoice}
              onManualInvoice={(patientId, visitId) => {
                setManualPrefill({ patientId, visitId });
                setTab("invoice");
              }}
            />
          )}
          {tab === "invoice" && (
            <InvoicePanel
              activeInvoice={activeInvoice}
              onInvoice={setActiveInvoice}
              lastPayment={lastPayment}
              lastReceipt={lastReceipt}
              lastRefund={lastRefund}
              onPayment={(payment, receipt) => {
                setLastPayment(payment);
                setLastReceipt(receipt);
              }}
              onRefund={setLastRefund}
              manualPrefill={manualPrefill}
              onManualPrefillConsumed={() => setManualPrefill(null)}
            />
          )}
          {tab === "patient" && (
            <PatientBillingPanel
              onOpenInvoice={(invoice) => {
                setActiveInvoice(invoice);
                setTab("invoice");
              }}
            />
          )}
          {tab === "visit" && (
            <VisitBillingPanel
              onOpenInvoice={(invoiceId) => {
                setTab("invoice");
                void getInvoice(invoiceId).then(setActiveInvoice).catch(() => undefined);
              }}
            />
          )}
          {tab === "receipt" && <ReceiptLookupPanel />}
        </>
      )}
    </div>
  );
}

function ReportsPanel({
  highlightVisitId,
  onResolved,
  onManualInvoice,
}: {
  highlightVisitId: string | null;
  onResolved: (invoice: Invoice) => void;
  onManualInvoice: (patientId: string, visitId: string) => void;
}) {
  const [dateFrom, setDateFrom] = useState(daysAgo(7));
  const [dateTo, setDateTo] = useState(today());
  const [offset, setOffset] = useState(0);
  const [daily, setDaily] = useState<DailyReconciliation | null>(null);
  const [methods, setMethods] = useState<PaymentMethodSummary | null>(null);
  const [leakage, setLeakage] = useState<BillingLeakage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvingExceptionId, setResolvingExceptionId] = useState<string | null>(null);
  const [resolvedNotice, setResolvedNotice] = useState<string | null>(null);
  // Only auto-open the highlighted row's resolution modal once, the first
  // time it's found — otherwise every refresh (Prev/Next, date change,
  // post-resolve reload) would keep reopening it.
  const [autoOpenedFor, setAutoOpenedFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (dateTo < dateFrom) {
      setError("Date to must be the same as or after date from.");
      return;
    }
    setLoading(true);
    try {
      const [dailyResult, methodResult, leakageResult] = await Promise.all([
        getDailyReconciliation({ date_from: dateFrom, date_to: dateTo }),
        getPaymentMethodSummary({ date_from: dateFrom, date_to: dateTo }),
        getBillingLeakage({ date_from: dateFrom, date_to: dateTo, limit: 50, offset }),
      ]);
      setDaily(dailyResult);
      setMethods(methodResult);
      setLeakage(leakageResult);
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't load billing reports.");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, offset]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  // Closes the loop from the consultation workspace's "Resolve pricing
  // exception" link: if the visit it sent us here for is actually in this
  // page of results and still has an open exception, jump straight into
  // resolving it instead of leaving staff to find the row themselves.
  useEffect(() => {
    if (!highlightVisitId || autoOpenedFor === highlightVisitId) return;
    const match = leakage?.candidates.find(
      (c) => c.visit_id === highlightVisitId && c.exception_id,
    );
    if (match?.exception_id) {
      queueMicrotask(() => {
        setAutoOpenedFor(highlightVisitId);
        setResolvingExceptionId(match.exception_id!);
      });
    }
  }, [autoOpenedFor, highlightVisitId, leakage]);

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-[160px_160px_auto] md:items-end">
          <DateInput label="From" value={dateFrom} onChange={setDateFrom} />
          <DateInput label="To" value={dateTo} onChange={setDateTo} />
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-3.5 text-[12.5px] font-medium text-white disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
        {error && <div className="mt-3 text-[12px] text-alert">{error}</div>}
      </div>

      {resolvedNotice && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-approved-line bg-approved-tint px-4 py-2.5 text-[12.5px] text-approved">
          {resolvedNotice}
          <button
            type="button"
            onClick={() => setResolvedNotice(null)}
            className="text-approved/70 hover:text-approved"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {loading && !daily ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ListSkeleton rows={4} />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <MetricCard
            icon={Banknote}
            label="Daily reconciliation"
            value={daily ? money(daily.payment_total, daily.currency) : "-"}
            sub={`${daily?.payment_count ?? 0} payments`}
          />
          <MetricCard
            icon={CreditCard}
            label="Payment methods"
            value={String(methods?.methods.length ?? 0)}
            sub="methods with activity"
          />
          <MetricCard
            icon={ArchiveX}
            label="Leakage candidates"
            value={String(leakage?.total_count ?? 0)}
            sub="completed visits needing billing review"
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-[13px] font-semibold text-ink">Payment method summary</h2>
          <div className="mt-3 flex flex-col gap-2">
            {methods && methods.methods.length > 0 ? (
              methods.methods.map((item) => (
                <div
                  key={item.method}
                  className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px]"
                >
                  <span className="capitalize text-ink">{item.method.replaceAll("_", " ")}</span>
                  <span className="text-ink-2">
                    {money(item.payment_total, methods.currency)} · {item.payment_count}
                  </span>
                </div>
              ))
            ) : (
              <EmptyInline text="No payment method rows for this range." />
            )}
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-semibold text-ink">Leakage report</h2>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 50))}
                className="rounded-lg border border-line-2 px-2.5 py-1 text-[11.5px] text-ink-2 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={!leakage || offset + 50 >= leakage.total_count}
                onClick={() => setOffset(offset + 50)}
                className="rounded-lg border border-line-2 px-2.5 py-1 text-[11.5px] text-ink-2 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {leakage && leakage.candidates.length > 0 ? (
              leakage.candidates.map((item, index) => (
                <LeakageRow
                  key={`${item.visit_id ?? "visit"}-${item.exception_type}-${index}`}
                  item={item}
                  highlighted={
                    Boolean(highlightVisitId) && item.visit_id === highlightVisitId
                  }
                  onClick={() => {
                    if (item.exception_id) {
                      setResolvingExceptionId(item.exception_id);
                    } else if (item.patient_id && item.visit_id) {
                      onManualInvoice(item.patient_id, item.visit_id);
                    }
                  }}
                />
              ))
            ) : (
              <EmptyInline text="No leakage candidates for this range." />
            )}
          </div>
        </section>
      </div>

      {resolvingExceptionId && (
        <ResolvePricingExceptionModal
          exceptionId={resolvingExceptionId}
          onClose={() => setResolvingExceptionId(null)}
          onResolved={(invoice) => {
            setResolvingExceptionId(null);
            setResolvedNotice(
              `Invoice ${invoice.invoice_id} created — this exception is resolved and will drop off the leakage report.`,
            );
            onResolved(invoice);
            void load();
          }}
        />
      )}
    </section>
  );
}

function LeakageRow({
  item,
  highlighted,
  onClick,
}: {
  item: BillingLeakageCandidate;
  highlighted: boolean;
  onClick: () => void;
}) {
  const actionable = Boolean(item.exception_id) || Boolean(item.patient_id && item.visit_id);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!actionable}
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors ${
        highlighted
          ? "border-brand-line bg-brand-tint"
          : "border-line bg-surface-2 hover:border-brand-line hover:bg-brand-tint/40"
      } ${!actionable ? "cursor-default opacity-70" : ""}`}
    >
      <div className="min-w-0">
        <div className="font-medium text-ink">
          {item.exception_type.replaceAll("_", " ")}
        </div>
        <div className="mt-0.5 text-[11.5px] text-ink-3">
          Visit {item.visit_id ?? "-"} · Patient {item.patient_id ?? "-"}
        </div>
      </div>
      {item.exception_id ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-[10.5px] font-medium text-brand">
          <Wand2 size={11} /> Resolve
        </span>
      ) : actionable ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10.5px] font-medium text-ink-2">
          <FilePlus2 size={11} /> Manual invoice
        </span>
      ) : null}
    </button>
  );
}

/** Resolves a pricing_required_unresolved leakage row. Patient/visit/
 *  appointment come from GET /billing-finance/exceptions/{id} and are
 *  read-only — they're already validated server-side, so hand-editing
 *  them here would just let a mismatch slip past that validation instead
 *  of catching it. Only amount/description/currency are real inputs. */
function ResolvePricingExceptionModal({
  exceptionId,
  onClose,
  onResolved,
}: {
  exceptionId: string;
  onClose: () => void;
  onResolved: (invoice: Invoice) => void;
}) {
  const [exception, setException] = useState<BillingException | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      setLoading(true);
      setLoadError(null);
      getBillingException(exceptionId)
        .then((data) => {
          if (cancelled) return;
          setException(data);
          const reason = typeof data.payload.reason === "string" ? data.payload.reason : "";
          if (reason) setDescription(reason);
        })
        .catch((e) => {
          if (!cancelled) {
            setLoadError(isApiError(e) ? e.message : "Couldn't load this exception.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [exceptionId]);

  const appointmentId =
    typeof exception?.payload.appointment_id === "string"
      ? exception.payload.appointment_id
      : null;
  const appointmentType =
    typeof exception?.payload.appointment_type === "string"
      ? exception.payload.appointment_type
      : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!exception?.patient_id || !exception?.visit_id) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const invoice = await createInvoice({
        patient_id: exception.patient_id,
        visit_id: exception.visit_id,
        appointment_id: appointmentId,
        description: description.trim(),
        amount,
        currency: currency.trim().toUpperCase(),
        exception_id: exception.exception_id,
      });
      onResolved(invoice);
    } catch (err) {
      setSubmitError(isApiError(err) ? err.message : "Couldn't resolve this exception.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/30 px-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">
              Resolve pricing exception
            </h2>
            <p className="text-[11.5px] text-ink-3">
              No fee schedule was found for this visit — set the amount to bill.
            </p>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-ink-2">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : loadError || !exception ? (
          <div className="flex items-start gap-2 rounded-lg border border-alert-line bg-alert-tint px-3.5 py-3 text-[12.5px] text-alert">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            {loadError ?? "This exception could not be loaded."}
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3.5">
            {submitError && (
              <div className="flex items-start gap-2 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                {submitError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5 text-[12px]">
              <Value label="Patient" value={exception.patient_id ?? "-"} mono />
              <Value label="Visit" value={exception.visit_id ?? "-"} mono />
              <Value label="Appointment" value={appointmentId ?? "-"} mono />
              <Value
                label="Type"
                value={appointmentType ? appointmentType.replaceAll("_", " ") : "-"}
              />
            </div>

            <TextInput
              label="Description"
              value={description}
              onChange={setDescription}
              required
            />
            <div className="grid grid-cols-[1fr_84px] gap-2">
              <TextInput label="Amount" value={amount} onChange={setAmount} required />
              <TextInput label="Currency" value={currency} onChange={setCurrency} required />
            </div>
            <SubmitButton busy={busy}>Create invoice &amp; resolve</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}

function InvoicePanel({
  activeInvoice,
  onInvoice,
  lastPayment,
  lastReceipt,
  lastRefund,
  onPayment,
  onRefund,
  manualPrefill,
  onManualPrefillConsumed,
}: {
  activeInvoice: Invoice | null;
  onInvoice: (invoice: Invoice | null) => void;
  lastPayment: Payment | null;
  lastReceipt: Receipt | null;
  lastRefund: Refund | null;
  onPayment: (payment: Payment, receipt: Receipt) => void;
  onRefund: (refund: Refund) => void;
  manualPrefill: { patientId: string; visitId: string } | null;
  onManualPrefillConsumed: () => void;
}) {
  const { scope } = useSession();
  const canCreate = hasPermission(scope, "invoice.create");
  const canUpdate = hasPermission(scope, "invoice.update");
  const canPay = hasPermission(scope, "payment.create");
  const canRefund = hasPermission(scope, "refund.create");
  const [invoiceId, setInvoiceId] = useState(activeInvoice?.invoice_id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadInvoice(id = invoiceId.trim()) {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      onInvoice(await getInvoice(id));
      setInvoiceId(id);
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't load invoice.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-4">
        <LookupCard
          title="Find invoice"
          value={invoiceId}
          onChange={setInvoiceId}
          onSearch={() => loadInvoice()}
          placeholder="Invoice ID"
          loading={loading}
          error={error}
        />
        {activeInvoice ? (
          <InvoiceDetail invoice={activeInvoice} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <EmptyState
              icon={ReceiptText}
              title="No invoice selected"
              description="Load a known invoice ID, open one from a patient, or open one from a Visit summary."
            />
          </div>
        )}
        {lastPayment && lastReceipt && (
          <ResultCard
            title="Latest payment"
            lines={[
              `Payment ${lastPayment.payment_id}`,
              `Receipt ${lastReceipt.receipt_number}`,
              money(lastPayment.amount, activeInvoice?.currency),
            ]}
          />
        )}
        {lastRefund && (
          <ResultCard
            title="Latest refund"
            lines={[
              `Refund ${lastRefund.refund_id}`,
              `Payment ${lastRefund.payment_id}`,
              money(lastRefund.amount, activeInvoice?.currency),
            ]}
          />
        )}
      </div>

      <div className="flex flex-col gap-4">
        {canCreate && (
          <CreateInvoiceForm
            onCreated={onInvoice}
            initialPatientId={manualPrefill?.patientId ?? ""}
            initialVisitId={manualPrefill?.visitId ?? ""}
            onPrefillConsumed={onManualPrefillConsumed}
          />
        )}
        {activeInvoice && canPay && (
          <PaymentForm
            invoice={activeInvoice}
            onPaid={(payment, receipt, invoice) => {
              onPayment(payment, receipt);
              onInvoice(invoice);
            }}
            onInvoiceRefreshed={onInvoice}
          />
        )}
        {activeInvoice && canRefund && (
          <RefundForm
            key={`${activeInvoice.invoice_id}-${lastPayment?.payment_id ?? "manual"}`}
            invoice={activeInvoice}
            defaultPaymentId={lastPayment?.payment_id ?? ""}
            onRefunded={(refund, invoice) => {
              onRefund(refund);
              onInvoice(invoice);
            }}
          />
        )}
        {activeInvoice && canUpdate && (
          <>
            <DiscountForm invoice={activeInvoice} onUpdated={onInvoice} />
            <VoidForm invoice={activeInvoice} onUpdated={onInvoice} />
          </>
        )}
      </div>
    </section>
  );
}

function PatientBillingPanel({
  onOpenInvoice,
}: {
  onOpenInvoice: (invoice: Invoice) => void;
}) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientLabel, setPatientLabel] = useState("");
  const [patientItems, setPatientItems] = useState<TypeaheadItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [outstanding, setOutstanding] = useState<PatientOutstanding | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (patientId || patientQuery.trim().length < 2) {
      queueMicrotask(() => setPatientItems([]));
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await searchPatients({ q: patientQuery.trim(), limit: 8 });
        if (!cancelled) {
          setPatientItems(
            results.map((p) => ({ key: p.patient_id, label: p.full_name, sublabel: p.mrn })),
          );
        }
      } catch {
        if (!cancelled) setPatientItems([]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patientQuery, patientId]);

  async function load() {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const [invoiceList, balance] = await Promise.all([
        listPatientInvoices(patientId),
        getPatientOutstanding(patientId),
      ]);
      setInvoices(invoiceList);
      setOutstanding(balance);
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't load patient billing.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <label>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Patient
          </span>
          <Typeahead
            items={patientItems}
            value={patientId ? patientLabel : patientQuery}
            onChange={(value) => {
              setPatientQuery(value);
              setPatientId(null);
            }}
            onSelect={(item) => {
              setPatientId(item.key);
              setPatientLabel(item.label);
              setPatientQuery(item.label);
            }}
            placeholder="Search patients..."
          />
        </label>
        <button
          type="button"
          disabled={!patientId || loading}
          onClick={load}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-3.5 text-[12.5px] font-medium text-white disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Load
        </button>
      </div>
      {error && <div className="mt-3 text-[12px] text-alert">{error}</div>}
      {outstanding && (
        <div className="mt-4 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink">
          Outstanding: {money(outstanding.outstanding_amount, outstanding.currency)}
        </div>
      )}
      <div className="mt-4 flex flex-col gap-2">
        {loading ? (
          <ListSkeleton rows={3} />
        ) : invoices.length > 0 ? (
          invoices.map((invoice) => (
            <button
              key={invoice.invoice_id}
              type="button"
              onClick={() => onOpenInvoice(invoice)}
              className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-left hover:border-brand-line"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[12px] text-ink">{invoice.invoice_id}</span>
                <StatusBadge tone={STATUS_TONE[invoice.status] ?? "neutral"}>
                  {invoice.status.replaceAll("_", " ")}
                </StatusBadge>
              </div>
              <div className="mt-1 text-[12px] text-ink-3">
                {money(invoice.total_amount, invoice.currency)} · Paid {invoice.paid_amount} ·
                Refunded {invoice.refunded_amount}
              </div>
            </button>
          ))
        ) : (
          <EmptyInline text="Select a patient and load invoices." />
        )}
      </div>
    </section>
  );
}

function VisitBillingPanel({ onOpenInvoice }: { onOpenInvoice: (invoiceId: string) => void }) {
  const [visitId, setVisitId] = useState("");
  const [summary, setSummary] = useState<VisitInvoiceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!visitId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setSummary(await getVisitInvoiceSummary(visitId.trim()));
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't load Visit invoice summary.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <LookupCard
        title="Visit invoice summary"
        value={visitId}
        onChange={setVisitId}
        onSearch={load}
        placeholder="Visit ID"
        loading={loading}
        error={error}
      />
      {summary && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Value label="Billing" value={summary.billing_status} />
            <Value label="Total" value={money(summary.total_amount, summary.currency)} />
            <Value label="Paid" value={money(summary.paid_amount, summary.currency)} />
            <Value
              label="Outstanding"
              value={money(summary.outstanding_amount, summary.currency)}
            />
          </div>
          {summary.invoice_id && (
            <button
              type="button"
              onClick={() => onOpenInvoice(summary.invoice_id as string)}
              className="mt-3 rounded-lg bg-brand px-3 py-2 text-[12.5px] font-medium text-white"
            >
              Open invoice
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function ReceiptLookupPanel() {
  const [receiptId, setReceiptId] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!receiptId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setReceipt(await getReceipt(receiptId.trim()));
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't load receipt.");
    } finally {
      setLoading(false);
    }
  }

  async function download() {
    if (!receipt) return;
    setError(null);
    try {
      const blob = await downloadReceipt(receipt.receipt_id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't open receipt.");
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <LookupCard
        title="Find receipt"
        value={receiptId}
        onChange={setReceiptId}
        onSearch={load}
        placeholder="Receipt ID"
        loading={loading}
        error={error}
      />
      {receipt && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Value label="Receipt" value={receipt.receipt_number} />
            <Value label="Amount" value={receipt.amount} />
            <Value label="Invoice" value={receipt.invoice_id} mono />
            <Value label="Issued" value={formatDateTime(receipt.issued_at)} />
          </div>
          <button
            type="button"
            onClick={download}
            className="mt-3 rounded-lg bg-brand px-3 py-2 text-[12.5px] font-medium text-white"
          >
            Open receipt text
          </button>
        </div>
      )}
    </section>
  );
}

function CreateInvoiceForm({
  onCreated,
  initialPatientId = "",
  initialVisitId = "",
  onPrefillConsumed,
}: {
  onCreated: (invoice: Invoice) => void;
  /** Carried over from a "completed_visit_without_invoice" leakage row —
   *  the two identifiers already visible there, so staff don't retype
   *  them. Still plain editable fields: unlike the pricing-exception
   *  resolution flow, there's no exception record to validate them
   *  against server-side. */
  initialPatientId?: string;
  initialVisitId?: string;
  onPrefillConsumed?: () => void;
}) {
  const [patientId, setPatientId] = useState(initialPatientId);
  const [visitId, setVisitId] = useState(initialVisitId);
  const [appointmentId, setAppointmentId] = useState("");
  const [consultationId, setConsultationId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialPatientId || initialVisitId) {
      queueMicrotask(() => {
        setPatientId(initialPatientId);
        setVisitId(initialVisitId);
        onPrefillConsumed?.();
      });
    }
    // Apply a fresh prefill when it arrives; onPrefillConsumed clears the
    // parent's state so this doesn't reapply on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPatientId, initialVisitId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(
        await createInvoice({
          patient_id: patientId.trim(),
          visit_id: visitId.trim(),
          appointment_id: appointmentId.trim() || null,
          consultation_id: consultationId.trim() || null,
          description: description.trim(),
          amount,
          currency: currency.trim().toUpperCase(),
        }),
      );
      setPatientId("");
      setVisitId("");
      setDescription("");
      setAppointmentId("");
      setConsultationId("");
      setAmount("");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't create invoice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActionForm title="Manual invoice (rare)" icon={FilePlus2} error={error} onSubmit={submit}>
      <p className="mb-1 text-[11.5px] leading-relaxed text-ink-3">
        Most invoices are created automatically at check-in with the correct
        fee-schedule amount. Use this only for a visit that completed with
        no invoice at all — for a pricing exception, resolve it directly
        from its row in the leakage report instead.
      </p>
      <TextInput label="Patient ID" value={patientId} onChange={setPatientId} required />
      <TextInput label="Visit ID" value={visitId} onChange={setVisitId} required />
      <TextInput
        label="Appointment ID"
        value={appointmentId}
        onChange={setAppointmentId}
      />
      <TextInput
        label="Consultation ID"
        value={consultationId}
        onChange={setConsultationId}
      />
      <TextInput label="Description" value={description} onChange={setDescription} required />
      <div className="grid grid-cols-[1fr_84px] gap-2">
        <TextInput label="Amount" value={amount} onChange={setAmount} required />
        <TextInput label="Currency" value={currency} onChange={setCurrency} required />
      </div>
      <SubmitButton busy={busy}>Create</SubmitButton>
    </ActionForm>
  );
}

function PaymentForm({
  invoice,
  onPaid,
  onInvoiceRefreshed,
}: {
  invoice: Invoice;
  onPaid: (payment: Payment, receipt: Receipt, invoice: Invoice) => void;
  onInvoiceRefreshed: (invoice: Invoice) => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [key, setKey] = useState(makeIdempotencyKey("pay"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outstanding = Math.max(
    Number(invoice.total_amount) - Number(invoice.paid_amount) + Number(invoice.refunded_amount),
    0,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await recordPayment(
        invoice.invoice_id,
        {
          amount,
          method,
          reference_number: reference.trim() || null,
          idempotency_key: key,
        },
        key,
      );
      const refreshed = await getInvoice(invoice.invoice_id);
      onPaid(result.payment, result.receipt, refreshed);
      setAmount("");
      setReference("");
      setKey(makeIdempotencyKey("pay"));
    } catch (err) {
      setError(conflictMessage(err, "Couldn't record payment."));
      if (isApiError(err) && err.code === "CONFLICT_DUPLICATE_ENTITY") {
        try {
          onInvoiceRefreshed(await getInvoice(invoice.invoice_id));
        } catch {
          // Preserve the original conflict message.
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActionForm title="Record payment" icon={CreditCard} error={error} onSubmit={submit}>
      <div className="text-[11.5px] text-ink-3">
        Outstanding: {money(outstanding.toFixed(2), invoice.currency)}
      </div>
      <TextInput label="Amount" value={amount} onChange={setAmount} required />
      <label>
        <span className="mb-1 block text-[11px] font-medium text-ink-2">Method</span>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="h-9 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
        >
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="wallet">Wallet</option>
        </select>
      </label>
      <TextInput label="Reference" value={reference} onChange={setReference} />
      <SubmitButton busy={busy}>Pay</SubmitButton>
    </ActionForm>
  );
}

function RefundForm({
  invoice,
  defaultPaymentId,
  onRefunded,
}: {
  invoice: Invoice;
  defaultPaymentId: string;
  onRefunded: (refund: Refund, invoice: Invoice) => void;
}) {
  const [paymentId, setPaymentId] = useState(defaultPaymentId);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(makeIdempotencyKey("refund"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refundable = Math.max(Number(invoice.paid_amount) - Number(invoice.refunded_amount), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const refund = await refundPayment(invoice.invoice_id, {
        payment_id: paymentId.trim(),
        amount,
        reason: reason.trim(),
        idempotency_key: key,
      });
      onRefunded(refund, await getInvoice(invoice.invoice_id));
      setAmount("");
      setReason("");
      setKey(makeIdempotencyKey("refund"));
    } catch (err) {
      setError(conflictMessage(err, "Couldn't refund payment."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActionForm title="Refund payment" icon={Undo2} error={error} onSubmit={submit}>
      <div className="text-[11.5px] text-ink-3">
        Paid {money(invoice.paid_amount, invoice.currency)} · Refunded{" "}
        {money(invoice.refunded_amount, invoice.currency)} · Remaining refundable{" "}
        {money(refundable.toFixed(2), invoice.currency)}
      </div>
      <TextInput label="Payment ID" value={paymentId} onChange={setPaymentId} required />
      <TextInput label="Amount" value={amount} onChange={setAmount} required />
      <TextInput label="Reason" value={reason} onChange={setReason} required />
      <SubmitButton busy={busy}>Refund</SubmitButton>
    </ActionForm>
  );
}

function DiscountForm({ invoice, onUpdated }: { invoice: Invoice; onUpdated: (i: Invoice) => void }) {
  const [amount, setAmount] = useState(invoice.discount_amount);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onUpdated(await authorizeDiscount(invoice.invoice_id, { amount, reason: reason.trim() }));
    } catch (err) {
      setError(conflictMessage(err, "Couldn't apply discount."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActionForm title="Discount" icon={TicketPercent} error={error} onSubmit={submit}>
      <TextInput label="Amount" value={amount} onChange={setAmount} required />
      <TextInput label="Reason" value={reason} onChange={setReason} required />
      <SubmitButton busy={busy}>Apply</SubmitButton>
    </ActionForm>
  );
}

function VoidForm({ invoice, onUpdated }: { invoice: Invoice; onUpdated: (i: Invoice) => void }) {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      onUpdated(await voidInvoice(invoice.invoice_id, { reason: reason.trim() }));
    } catch (err) {
      setError(conflictMessage(err, "Couldn't void invoice."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActionForm title="Void invoice" icon={ArchiveX} error={error} onSubmit={submit}>
      <div className="text-[11.5px] text-ink-3">
        Only invoices without payment or refund activity can be voided.
      </div>
      <TextInput label="Reason" value={reason} onChange={setReason} required />
      <label className="flex items-start gap-2 text-[12px] text-ink-2">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
          className="mt-0.5"
        />
        I understand this changes the linked Visit billing state.
      </label>
      <SubmitButton busy={busy} disabled={!confirm}>
        Void
      </SubmitButton>
    </ActionForm>
  );
}

function InvoiceDetail({ invoice }: { invoice: Invoice }) {
  const outstanding = Math.max(
    Number(invoice.total_amount) - Number(invoice.paid_amount) + Number(invoice.refunded_amount),
    0,
  );
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold text-ink">
          {invoice.invoice_id}
        </h2>
        <StatusBadge tone={STATUS_TONE[invoice.status] ?? "neutral"}>
          {invoice.status.replaceAll("_", " ")}
        </StatusBadge>
        <StatusBadge tone={invoice.refund_status === "none" ? "neutral" : "warning"}>
          {invoice.refund_status.replaceAll("_", " ")}
        </StatusBadge>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Value label="Subtotal" value={money(invoice.subtotal, invoice.currency)} />
        <Value label="Discount" value={money(invoice.discount_amount, invoice.currency)} />
        <Value label="Total" value={money(invoice.total_amount, invoice.currency)} />
        <Value label="Outstanding" value={money(outstanding.toFixed(2), invoice.currency)} />
        <Value label="Paid" value={money(invoice.paid_amount, invoice.currency)} />
        <Value label="Refunded" value={money(invoice.refunded_amount, invoice.currency)} />
        <Value label="Patient" value={invoice.patient_id} mono />
        <Value label="Visit" value={invoice.visit_id} mono />
      </div>
      {invoice.void_reason && (
        <div className="mt-3 rounded-lg border border-alert-line bg-alert-tint px-3 py-2 text-[12px] text-alert">
          Void reason: {invoice.void_reason}
        </div>
      )}
    </section>
  );
}

function LookupCard({
  title,
  value,
  onChange,
  onSearch,
  placeholder,
  loading,
  error,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  placeholder: string;
  loading: boolean;
  error: string | null;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-3 text-[13px] font-semibold text-ink">{title}</h2>
      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 rounded-lg border border-line-2 bg-surface px-3 text-[13px] text-ink outline-none focus:border-brand"
        />
        <button
          type="button"
          disabled={!value.trim() || loading}
          onClick={onSearch}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-3.5 text-[12.5px] font-medium text-white disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Load
        </button>
      </div>
      {error && <div className="mt-3 text-[12px] text-alert">{error}</div>}
    </section>
  );
}

function ActionForm({
  title,
  icon: Icon,
  error,
  onSubmit,
  children,
}: {
  title: string;
  icon: LucideIcon;
  error: string | null;
  onSubmit: (event: React.FormEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-brand-tint text-brand">
          <Icon size={15} />
        </span>
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
      {error && <div className="mt-3 text-[12px] text-alert">{error}</div>}
    </form>
  );
}

function TextInput({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label>
      <span className="mb-1 block text-[11px] font-medium text-ink-2">{label}</span>
      <input
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
      />
    </label>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand"
      />
    </label>
  );
}

function SubmitButton({
  busy,
  disabled,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="mt-1 inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand px-3 text-[12.5px] font-medium text-white disabled:opacity-50"
    >
      {busy && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

function Value({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className={`truncate text-[13px] text-ink ${mono ? "font-mono" : ""}`}>
        {value || "-"}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 grid size-8 place-items-center rounded-lg bg-brand-tint text-brand">
        <Icon size={15} />
      </div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </div>
      <div className="mt-1 text-[18px] font-semibold text-ink">{value}</div>
      <div className="mt-0.5 text-[12px] text-ink-3">{sub}</div>
    </div>
  );
}

function ResultCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      <div className="mt-2 flex flex-col gap-1 text-[12px] text-ink-3">
        {lines.map((line) => (
          <div key={line} className="truncate">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyInline({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[12px] text-ink-3">
      {text}
    </div>
  );
}

function conflictMessage(error: unknown, fallback: string) {
  if (!isApiError(error)) return fallback;
  const details = error.details as Record<string, unknown> | undefined;
  const limit =
    details?.maximum_discount ??
    details?.outstanding_amount ??
    details?.refundable_amount ??
    details?.payment_refundable;
  return limit ? `${error.message} Maximum allowed: ${String(limit)}.` : error.message;
}
