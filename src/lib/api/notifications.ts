// lib/api/notifications.ts
// Notification queue and transactional outbox operations. The documented API
// has no per-notification retry/cancel endpoints, so wrappers only expose the
// actual list/detail/enqueue/process contracts.

import { apiGet, apiGetWithMeta, apiPost, type PageMeta } from "@/lib/api";
import type { components } from "@/types/api";

export type NotificationEnqueue = components["schemas"]["NotificationEnqueue"];
export type Notification = components["schemas"]["NotificationResponse"];
export type OutboxEvent = components["schemas"]["OutboxEventResponse"];

export interface NotificationListParams {
  patient_id?: string;
  status?: "pending" | "retry" | "delivered" | "failed" | "cancelled";
  notification_id?: string;
  page?: number;
  page_size?: number;
}

export interface ProcessOutboxResult {
  processed: number;
}

export function listNotifications(
  params: NotificationListParams = {},
): Promise<{ data: Notification[]; meta: PageMeta }> {
  return apiGetWithMeta<Notification[]>("/notifications/queue", {
    params: {
      patient_id: params.patient_id || undefined,
      status: params.status || undefined,
      notification_id: params.notification_id || undefined,
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
    },
  });
}

export function enqueueNotification(
  body: NotificationEnqueue,
): Promise<Notification> {
  return apiPost<Notification>("/notifications/queue", body);
}

export function getNotification(notificationId: string): Promise<Notification> {
  return apiGet<Notification>(`/notifications/${notificationId}`);
}

export function listNotificationOutbox(): Promise<OutboxEvent[]> {
  return apiGet<OutboxEvent[]>("/notifications/outbox");
}

export function processNotificationOutbox(): Promise<ProcessOutboxResult> {
  return apiPost<ProcessOutboxResult>("/notifications/outbox/process");
}
