// lib/api/intelligence.ts
// Deterministic analytics plus natural-language ask. Metrics/rows are
// intentionally generic because each backend tool owns its own output schema.

import { apiGet, apiPost } from "@/lib/api";
import type { components } from "@/types/api";

export type ToolDefinition = components["schemas"]["ToolDefinition"];
export type ToolExecutionRequest =
  components["schemas"]["ToolExecutionRequest"];
export type ToolExecution = components["schemas"]["ToolExecutionResponse"];
export type IntelligenceDashboard =
  components["schemas"]["DashboardResponse"];
export type NaturalLanguageQueryRequest =
  components["schemas"]["NaturalLanguageQueryRequest"];
export type NaturalLanguageQuery =
  components["schemas"]["NaturalLanguageQueryResponse"];

export function listIntelligenceTools(): Promise<ToolDefinition[]> {
  return apiGet<ToolDefinition[]>("/intelligence/tools", { skipFacility: true });
}

export function executeIntelligenceTool(
  toolName: string,
  body: ToolExecutionRequest,
): Promise<ToolExecution> {
  return apiPost<ToolExecution>(`/intelligence/tools/${toolName}`, body);
}

export function getIntelligenceDashboard(params: ToolExecutionRequest): Promise<IntelligenceDashboard> {
  return apiGet<IntelligenceDashboard>("/intelligence/dashboard", {
    params: {
      date_from: params.date_from,
      date_to: params.date_to,
      scope: params.scope,
      limit: params.limit,
    },
  });
}

export function askIntelligence(
  body: NaturalLanguageQueryRequest,
): Promise<NaturalLanguageQuery> {
  return apiPost<NaturalLanguageQuery>("/intelligence/ask", body);
}
