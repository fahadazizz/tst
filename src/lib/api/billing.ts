// lib/api/billing.ts
// Billing/Finance primitives. The backend intentionally does not expose a
// general Facility-wide invoice/payment/refund worklist, so frontend entry
// points must start from known Visit, Patient, Invoice, or Receipt IDs plus
// the documented reports.

import { apiDownload, apiGet, apiPost } from "@/lib/api";
import type { components } from "@/types/api";

export type VisitInvoiceSummary =
  components["schemas"]["VisitInvoiceSummaryResponse"];
export type PaymentCreate = components["schemas"]["PaymentCreate"];
export type Payment = components["schemas"]["PaymentResponse"];
export type Receipt = components["schemas"]["ReceiptResponse"];
export type Invoice = components["schemas"]["InvoiceResponse"];
// The generated schema (src/types/api.ts, from openapi.json) predates the
// backend's billing-exception resolution feature and is missing
// exception_id on both of these — confirmed directly against
// hms-backend/src/modules/billing_finance/schemas.py. Hand-extended here
// rather than hand-editing the auto-generated file; re-running
// `npm run generate:types` against a live backend should make this
// extension redundant (safe either way — same field, same type).
export type InvoiceCreate = components["schemas"]["InvoiceCreate"] & {
  /** Links this invoice to the BillingException it resolves (from a
   *  pricing_required_unresolved leakage-report row). The backend
   *  cross-checks patient_id/visit_id against the exception record and
   *  marks it resolved afterward. Omit for a standalone manual invoice
   *  (the completed_visit_without_invoice case, which has no exception). */
  exception_id?: string | null;
};
export type InvoiceDiscountRequest =
  components["schemas"]["InvoiceDiscountRequest"];
export type InvoiceVoidRequest = components["schemas"]["InvoiceVoidRequest"];
export type PatientOutstanding =
  components["schemas"]["PatientOutstandingResponse"];
export type RefundCreate = components["schemas"]["RefundCreate"];
export type Refund = components["schemas"]["RefundResponse"];
export type DailyReconciliation =
  components["schemas"]["DailyReconciliationResponse"];
export type PaymentMethodSummary =
  components["schemas"]["PaymentMethodSummaryResponse"];
export type BillingLeakageCandidate = Omit<
  components["schemas"]["BillingLeakageItem"],
  "exception_id"
> & {
  /** Present only for exception-backed candidates (currently
   *  pricing_required_unresolved) — null for completed_visit_without_invoice,
   *  which is a live consistency check with no backing exception row to
   *  resolve. See getBillingException() below. */
  exception_id: string | null;
};
export type BillingLeakage = Omit<
  components["schemas"]["BillingLeakageResponse"],
  "candidates"
> & {
  candidates: BillingLeakageCandidate[];
};
/** GET /billing-finance/exceptions/{exception_id} response. Hand-typed —
 *  same staleness note as InvoiceCreate/BillingLeakage above; this endpoint
 *  doesn't exist in the generated schema at all yet. `payload` carries
 *  exception-type-specific context (for pricing_required_unresolved:
 *  appointment_id/appointment_type/reason) as a loose bag, not a typed
 *  shape, matching the backend's own `dict[str, object]`. */
export interface BillingException {
  exception_id: string;
  organisation_id: string;
  facility_id: string;
  visit_id: string | null;
  patient_id: string | null;
  invoice_id: string | null;
  exception_type: string;
  status: string;
  payload: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
}

export interface PaymentReceiptResult {
  payment: Payment;
  receipt: Receipt;
}

export interface DateRangeParams {
  date_from: string;
  date_to: string;
}

export interface LeakageParams extends DateRangeParams {
  limit?: number;
  offset?: number;
}

/** POST /billing-finance/invoices */
export function createInvoice(body: InvoiceCreate): Promise<Invoice> {
  return apiPost<Invoice>("/billing-finance/invoices", body);
}

/** GET /billing-finance/invoices/{invoiceId} */
export function getInvoice(invoiceId: string): Promise<Invoice> {
  return apiGet<Invoice>(`/billing-finance/invoices/${invoiceId}`);
}

/** GET /billing-finance/visits/{visitId}/invoice-summary */
export function getVisitInvoiceSummary(
  visitId: string,
): Promise<VisitInvoiceSummary> {
  return apiGet<VisitInvoiceSummary>(
    `/billing-finance/visits/${visitId}/invoice-summary`,
  );
}

/** POST /billing-finance/invoices/{invoiceId}/payments */
export function recordPayment(
  invoiceId: string,
  body: PaymentCreate,
  idempotencyKey: string,
): Promise<PaymentReceiptResult> {
  return apiPost<PaymentReceiptResult>(
    `/billing-finance/invoices/${invoiceId}/payments`,
    body,
    { idempotencyKey },
  );
}

/** POST /billing-finance/invoices/{invoiceId}/refunds */
export function refundPayment(
  invoiceId: string,
  body: RefundCreate,
): Promise<Refund> {
  return apiPost<Refund>(`/billing-finance/invoices/${invoiceId}/refunds`, body);
}

/** POST /billing-finance/invoices/{invoiceId}/discount */
export function authorizeDiscount(
  invoiceId: string,
  body: InvoiceDiscountRequest,
): Promise<Invoice> {
  return apiPost<Invoice>(
    `/billing-finance/invoices/${invoiceId}/discount`,
    body,
  );
}

/** POST /billing-finance/invoices/{invoiceId}/void */
export function voidInvoice(
  invoiceId: string,
  body: InvoiceVoidRequest,
): Promise<Invoice> {
  return apiPost<Invoice>(`/billing-finance/invoices/${invoiceId}/void`, body);
}

/** GET /billing-finance/receipts/{receiptId} */
export function getReceipt(receiptId: string): Promise<Receipt> {
  return apiGet<Receipt>(`/billing-finance/receipts/${receiptId}`);
}

/** GET /billing-finance/receipts/{receiptId}/download */
export function downloadReceipt(receiptId: string): Promise<Blob> {
  return apiDownload(`/billing-finance/receipts/${receiptId}/download`);
}

/** GET /billing-finance/patients/{patientId}/invoices */
export function listPatientInvoices(patientId: string): Promise<Invoice[]> {
  return apiGet<Invoice[]>(`/billing-finance/patients/${patientId}/invoices`);
}

/** GET /billing-finance/patients/{patientId}/outstanding */
export function getPatientOutstanding(
  patientId: string,
): Promise<PatientOutstanding> {
  return apiGet<PatientOutstanding>(
    `/billing-finance/patients/${patientId}/outstanding`,
  );
}

/** GET /billing-finance/reports/daily-reconciliation */
export function getDailyReconciliation(
  params: DateRangeParams,
): Promise<DailyReconciliation> {
  return apiGet<DailyReconciliation>(
    "/billing-finance/reports/daily-reconciliation",
    { params: { date_from: params.date_from, date_to: params.date_to } },
  );
}

/** GET /billing-finance/reports/payment-method-summary */
export function getPaymentMethodSummary(
  params: DateRangeParams,
): Promise<PaymentMethodSummary> {
  return apiGet<PaymentMethodSummary>(
    "/billing-finance/reports/payment-method-summary",
    { params: { date_from: params.date_from, date_to: params.date_to } },
  );
}

/** GET /billing-finance/reports/leakage */
export function getBillingLeakage(params: LeakageParams): Promise<BillingLeakage> {
  return apiGet<BillingLeakage>("/billing-finance/reports/leakage", {
    params: {
      date_from: params.date_from,
      date_to: params.date_to,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
  });
}

/** GET /billing-finance/exceptions/{exceptionId} — the detail behind a
 *  pricing_required_unresolved leakage-report row (visit_id, patient_id,
 *  and a payload with appointment_id/appointment_type/reason), used to
 *  pre-fill the resolution invoice instead of making staff retype
 *  identifiers already visible on screen. */
export function getBillingException(exceptionId: string): Promise<BillingException> {
  return apiGet<BillingException>(`/billing-finance/exceptions/${exceptionId}`);
}
