// lib/telemetry.ts
// Minimal redacted frontend telemetry foundation (spec §22.4). This keeps
// request ids, status, timing, realm, method, and path only. It deliberately
// avoids request/response bodies, tokens, emails, names, CNICs, UUID-heavy
// query values, or clinical content.

export type TelemetryRealm = "tenant" | "platform";
export type TelemetryOutcome = "success" | "error" | "network_error" | "aborted";

export interface ApiTelemetryEvent {
  realm: TelemetryRealm;
  method: string;
  path: string;
  outcome: TelemetryOutcome;
  status?: number;
  requestId?: string;
  durationMs: number;
  errorCode?: string;
  timestamp: string;
}

const MAX_EVENTS = 100;
const events: ApiTelemetryEvent[] = [];

export function recordApiTelemetry(
  event: Omit<ApiTelemetryEvent, "timestamp">,
): void {
  events.push({ ...event, timestamp: new Date().toISOString() });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

export function getRecentApiTelemetry(): ApiTelemetryEvent[] {
  return [...events];
}

export function clearApiTelemetry(): void {
  events.length = 0;
}
