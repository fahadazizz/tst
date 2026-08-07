// lib/api/operations.ts
// Typed calls for the Operations module (appointments, queue). Thin wrappers
// over the shared client, which injects auth + X-Facility-ID and unwraps the
// { success, data, error } envelope.

import {
  apiGet,
  apiGetWithMeta,
  apiPatch,
  apiPost,
  type PageMeta,
} from "@/lib/api";
import type { components } from "@/types/api";

export type Appointment = components["schemas"]["AppointmentResponse"];
export type AppointmentCreate = components["schemas"]["AppointmentCreate"];
export type AppointmentReschedule =
  components["schemas"]["AppointmentReschedule"];
export type DoctorAvailability = components["schemas"]["DoctorAvailabilityResponse"];
export type ReceptionDashboard =
  components["schemas"]["ReceptionDashboardResponse"];
export type Visit = components["schemas"]["VisitResponse"];
export type VisitDischargeRequest =
  components["schemas"]["VisitDischargeRequest"];

export interface AppointmentListParams {
  date?: string;
  doctor_id?: string;
  department_id?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

/** GET /operations/appointments — list appointments for the facility. */
export function listAppointments(
  params: AppointmentListParams = {},
): Promise<Appointment[]> {
  return apiGet<Appointment[]>("/operations/appointments", {
    params: {
      date: params.date || undefined,
      doctor_id: params.doctor_id || undefined,
      department_id: params.department_id || undefined,
      status: params.status || undefined,
      page: params.page ?? 1,
      page_size: params.page_size ?? 50,
    },
  });
}

/** Same as listAppointments, but also returns the real total_count/page/
 *  page_size instead of discarding them. */
export function listAppointmentsWithMeta(
  params: AppointmentListParams = {},
): Promise<{ data: Appointment[]; meta: PageMeta }> {
  return apiGetWithMeta<Appointment[]>("/operations/appointments", {
    params: {
      date: params.date || undefined,
      doctor_id: params.doctor_id || undefined,
      department_id: params.department_id || undefined,
      status: params.status || undefined,
      page: params.page ?? 1,
      page_size: params.page_size ?? 50,
    },
  });
}

/** POST /operations/appointments — book a new appointment. */
export function createAppointment(
  body: AppointmentCreate,
): Promise<Appointment> {
  return apiPost<Appointment>("/operations/appointments", body);
}

/** POST /operations/appointments/{id}/reschedule */
export function rescheduleAppointment(
  appointmentId: string,
  body: AppointmentReschedule,
): Promise<Appointment> {
  return apiPost<Appointment>(
    `/operations/appointments/${appointmentId}/reschedule`,
    body,
  );
}

/** POST /operations/appointments/{id}/confirm */
export function confirmAppointment(appointmentId: string): Promise<Appointment> {
  return apiPost<Appointment>(
    `/operations/appointments/${appointmentId}/confirm`,
  );
}

/** GET /operations/doctors/availability?date= — bookable doctors for a date. */
export function getDoctorAvailability(
  date: string,
): Promise<DoctorAvailability[]> {
  return apiGet<DoctorAvailability[]>("/operations/doctors/availability", {
    params: { date },
  });
}

/** GET /operations/reception/dashboard?date= — aggregate front-desk snapshot. */
export function getReceptionDashboard(
  date: string,
): Promise<ReceptionDashboard> {
  return apiGet<ReceptionDashboard>("/operations/reception/dashboard", {
    params: { date },
  });
}

/** POST /operations/appointments/{id}/check-in — check a patient in. */
export function checkInAppointment(appointmentId: string): Promise<Appointment> {
  return apiPost<Appointment>(
    `/operations/appointments/${appointmentId}/check-in`,
  );
}

/** POST /operations/appointments/{id}/cancel */
export function cancelAppointment(
  appointmentId: string,
  reason: string,
): Promise<Appointment> {
  return apiPost<Appointment>(
    `/operations/appointments/${appointmentId}/cancel`,
    { cancellation_reason: reason },
  );
}

/** POST /operations/appointments/{id}/no-show */
export function markAppointmentNoShow(
  appointmentId: string,
): Promise<Appointment> {
  return apiPost<Appointment>(
    `/operations/appointments/${appointmentId}/no-show`,
  );
}

/** GET /operations/visits/{visitId} */
export function getVisit(visitId: string): Promise<Visit> {
  return apiGet<Visit>(`/operations/visits/${visitId}`);
}

/** POST /operations/visits/{visitId}/discharge */
export function dischargeVisit(
  visitId: string,
  body: VisitDischargeRequest,
): Promise<Visit> {
  return apiPost<Visit>(`/operations/visits/${visitId}/discharge`, body);
}
// ─── Follow-up tasks ─────────────────────────────────────────────────

export type FollowUpTask = components["schemas"]["FollowUpTaskResponse"];
export type FollowUpTaskCreate = components["schemas"]["FollowUpTaskCreate"];
export type FollowUpTaskUpdate = components["schemas"]["FollowUpTaskUpdate"];
export type FollowUpTaskLinkAppointment =
  components["schemas"]["FollowUpTaskLinkAppointment"];
export type FollowUpContactAttempt =
  components["schemas"]["FollowUpContactAttemptResponse"];
export type FollowUpContactAttemptCreate =
  components["schemas"]["FollowUpContactAttemptCreate"];

export interface TaskListParams {
  /** Required by the API — the user whose tasks to list. */
  assigned_to: string;
  status?: string;
}

/** GET /operations/tasks — follow-up tasks assigned to a user. */
export function listTasks(params: TaskListParams): Promise<FollowUpTask[]> {
  return apiGet<FollowUpTask[]>("/operations/tasks", {
    params: {
      assigned_to: params.assigned_to,
      status: params.status || undefined,
    },
  });
}

/** GET /operations/patients/{patientId}/tasks — all tasks for one patient. */
export function listPatientTasks(patientId: string): Promise<FollowUpTask[]> {
  return apiGet<FollowUpTask[]>(`/operations/patients/${patientId}/tasks`);
}

/** POST /operations/tasks — create a follow-up task. */
export function createTask(body: FollowUpTaskCreate): Promise<FollowUpTask> {
  return apiPost<FollowUpTask>("/operations/tasks", body);
}

/** GET /operations/tasks/{id} — fetch current task state. */
export function getTask(taskId: string): Promise<FollowUpTask> {
  return apiGet<FollowUpTask>(`/operations/tasks/${taskId}`);
}

/** PATCH /operations/tasks/{id} — update assignment/due date/instruction only. */
export function updateTask(
  taskId: string,
  body: FollowUpTaskUpdate,
): Promise<FollowUpTask> {
  return apiPatch<FollowUpTask>(`/operations/tasks/${taskId}`, body);
}

export type TaskDisposition =
  | "appointment_scheduled"
  | "patient_declined"
  | "unable_to_contact"
  | "doctor_cancelled"
  | "no_longer_required";

/** POST /operations/tasks/{id}/complete — close a follow-up task, recording how
 *  it was resolved (completion_disposition is required by the backend). */
export function completeTask(
  taskId: string,
  disposition: TaskDisposition,
  notes?: string,
  resultingAppointmentId?: string,
): Promise<FollowUpTask> {
  return apiPost<FollowUpTask>(`/operations/tasks/${taskId}/complete`, {
    completion_disposition: disposition,
    ...(resultingAppointmentId
      ? { resulting_appointment_id: resultingAppointmentId }
      : {}),
    ...(notes ? { completion_notes: notes } : {}),
  });
}
/** POST /operations/tasks/{id}/start — move a pending task to in-progress. */
export function startTask(taskId: string): Promise<FollowUpTask> {
  return apiPost<FollowUpTask>(`/operations/tasks/${taskId}/start`);
}

/** POST /operations/tasks/{id}/link-appointment — attach a resulting appointment. */
export function linkTaskAppointment(
  taskId: string,
  body: FollowUpTaskLinkAppointment,
): Promise<FollowUpTask> {
  return apiPost<FollowUpTask>(
    `/operations/tasks/${taskId}/link-appointment`,
    body,
  );
}

/** GET /operations/tasks/{id}/contact-attempts — durable contact history. */
export function listTaskContactAttempts(
  taskId: string,
): Promise<FollowUpContactAttempt[]> {
  return apiGet<FollowUpContactAttempt[]>(
    `/operations/tasks/${taskId}/contact-attempts`,
  );
}

/** POST /operations/tasks/{id}/contact-attempts — enqueue email if available. */
export function recordTaskContactAttempt(
  taskId: string,
  body: FollowUpContactAttemptCreate,
): Promise<FollowUpContactAttempt> {
  return apiPost<FollowUpContactAttempt>(
    `/operations/tasks/${taskId}/contact-attempts`,
    body,
  );
}

/** POST /operations/tasks/{id}/archive — archive pending or in-progress task. */
export function archiveTask(taskId: string): Promise<FollowUpTask> {
  return apiPost<FollowUpTask>(`/operations/tasks/${taskId}/archive`);
}
// ─── Queue ───────────────────────────────────────────────────────────

export type Queue = components["schemas"]["QueueResponse"];
export type QueueEntry = components["schemas"]["QueueEntryResponse"];
export type QueueReorderRequest =
  components["schemas"]["QueueReorderRequest"];

export interface QueueListParams {
  date?: string;
  doctor_id?: string;
  department_id?: string;
  status?: "open" | "closed";
  page?: number;
  page_size?: number;
}

/** GET /operations/queues — active queues for the facility, filterable. */
export function listQueues(params: QueueListParams = {}): Promise<Queue[]> {
  return apiGet<Queue[]>("/operations/queues", {
    params: {
      date: params.date || undefined,
      doctor_id: params.doctor_id || undefined,
      department_id: params.department_id || undefined,
      status: params.status || undefined,
      page: params.page ?? 1,
      page_size: params.page_size ?? 50,
    },
  });
}

/** Same as listQueues, but also returns the real total_count/page/page_size. */
export function listQueuesWithMeta(
  params: QueueListParams = {},
): Promise<{ data: Queue[]; meta: PageMeta }> {
  return apiGetWithMeta<Queue[]>("/operations/queues", {
    params: {
      date: params.date || undefined,
      doctor_id: params.doctor_id || undefined,
      department_id: params.department_id || undefined,
      status: params.status || undefined,
      page: params.page ?? 1,
      page_size: params.page_size ?? 50,
    },
  });
}

/** GET /operations/queue/{queueId}/entries — patients in a queue. No query
 *  params on this endpoint — queue_id comes from the path only. */
export function getQueueEntries(queueId: string): Promise<QueueEntry[]> {
  return apiGet<QueueEntry[]>(`/operations/queue/${queueId}/entries`);
}

/** POST /operations/queue/{queueId}/call-next — call the next patient. */
export function callNext(queueId: string): Promise<QueueEntry | null> {
  return apiPost<QueueEntry | null>(`/operations/queue/${queueId}/call-next`);
}

/** POST /operations/queue-entries/{entryId}/reorder */
export function reorderQueueEntry(
  entryId: string,
  body: QueueReorderRequest,
): Promise<QueueEntry> {
  return apiPost<QueueEntry>(
    `/operations/queue-entries/${entryId}/reorder`,
    body,
  );
}

/** POST /operations/queue-entries/{entryId}/start */
export function startQueueEntry(entryId: string): Promise<QueueEntry> {
  return apiPost<QueueEntry>(`/operations/queue-entries/${entryId}/start`);
}

/** POST /operations/queue-entries/{entryId}/complete */
export function completeQueueEntry(entryId: string): Promise<QueueEntry> {
  return apiPost<QueueEntry>(`/operations/queue-entries/${entryId}/complete`);
}

/** POST /operations/queue-entries/{entryId}/no-show */
export function noShowQueueEntry(entryId: string): Promise<QueueEntry> {
  return apiPost<QueueEntry>(`/operations/queue-entries/${entryId}/no-show`);
}

/** POST /operations/queue-entries/{entryId}/cancel */
export function cancelQueueEntry(entryId: string): Promise<QueueEntry> {
  return apiPost<QueueEntry>(`/operations/queue-entries/${entryId}/cancel`);
}
// ─── Queue join (reception sends a patient to a doctor's queue) ───────

export interface QueueJoinBody {
  facility_id: string;
  doctor_id: string;
  patient_id: string;
  appointment_id?: string;
  priority?: "routine" | "urgent" | "emergency";
}

/** POST /operations/queue/join — add a patient to a doctor's live queue
 *  (walk-in, or linked to a checked-in appointment). Creates the queue if the
 *  doctor has none open yet. Returns the created queue entry (with visit_id). */
export function joinQueue(body: QueueJoinBody): Promise<QueueEntry> {
  return apiPost<QueueEntry>("/operations/queue/join", body);
}

// ─── Referrals ───────────────────────────────────────────────────────
// Status state machine: pending -> accepted | declined | expired.
// Only staff at the destination facility (referred_to_facility) may respond
// — enforced server-side via X-Facility-ID, not just in this UI.

export type Referral = components["schemas"]["ReferralResponse"];
export type ReferralCreate = components["schemas"]["ReferralCreate"];

/** POST /operations/referrals — create a referral. facility_id (the
 *  referring facility) is always set server-side from X-Facility-ID and
 *  ignored if sent, so it's intentionally omitted here. */
export function createReferral(
  body: Omit<ReferralCreate, "facility_id">,
): Promise<Referral> {
  return apiPost<Referral>("/operations/referrals", body);
}

/** GET /operations/referrals/{id} */
export function getReferral(referralId: string): Promise<Referral> {
  return apiGet<Referral>(`/operations/referrals/${referralId}`);
}

/** GET /operations/patients/{patient_id}/referrals — a patient's referral history. */
export function listPatientReferrals(patientId: string): Promise<Referral[]> {
  return apiGet<Referral[]>(`/operations/patients/${patientId}/referrals`);
}

/** GET /operations/patients/{patientId}/appointments */
export function listPatientAppointments(
  patientId: string,
): Promise<Appointment[]> {
  return apiGet<Appointment[]>(`/operations/patients/${patientId}/appointments`);
}

/** GET /operations/facilities/{facility_id}/referrals/pending — referrals
 *  awaiting acceptance at a facility (incoming). There is no backend
 *  endpoint for "all outgoing referrals sent by a facility" — only
 *  per-patient history (listPatientReferrals) covers outgoing referrals. */
export function listPendingReferrals(facilityId: string): Promise<Referral[]> {
  return apiGet<Referral[]>(
    `/operations/facilities/${facilityId}/referrals/pending`,
  );
}

/** POST /operations/referrals/{id}/respond — accept or decline. */
export function respondToReferral(
  referralId: string,
  status: "accepted" | "declined",
  clinicalNotes?: string,
): Promise<Referral> {
  return apiPost<Referral>(`/operations/referrals/${referralId}/respond`, {
    status,
    ...(clinicalNotes ? { clinical_notes: clinicalNotes } : {}),
  });
}

/** POST /operations/referrals/{id}/expire — mark a pending referral expired. */
export function expireReferral(referralId: string): Promise<Referral> {
  return apiPost<Referral>(`/operations/referrals/${referralId}/expire`);
}
