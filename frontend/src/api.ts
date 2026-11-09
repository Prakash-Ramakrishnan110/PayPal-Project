// frontend/src/api.ts - Typed API Client for Mandate Guard

export interface MandateDraft {
  natural_language: string;
  currency: string;
  auto_approve_under_dollars: number;
  per_transaction_cap_dollars: number;
  monthly_cap_dollars: number;
  allowed_categories: string[];
  allowed_merchants: string[];
  blocked_categories: string[];
  max_quantity_per_item: number;
  expires_in_days: number;
  summary: string;
  assumptions: string[];
}

export interface Mandate {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  natural_language: string;
  currency: string;
  auto_approve_under_cents: number;
  per_transaction_cap_cents: number;
  monthly_cap_cents: number;
  allowed_categories: string[];
  allowed_merchants: string[];
  blocked_categories: string[];
  max_quantity_per_item: number;
  status: 'active' | 'revoked' | 'expired';
  signature: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  mandate_id?: string;
  event_type: string;
  decision?: 'ALLOW' | 'ESCALATE' | 'BLOCK';
  reason_codes: string[];
  amount_cents?: number;
  merchant?: string;
  category?: string;
  item_name?: string;
  payload_json?: string;
  paypal_order_id?: string;
}

export interface PendingApproval {
  id: string;
  timestamp: string;
  mandate_id: string;
  request_payload_json: string;
  amount_cents: number;
  merchant: string;
  item_name: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface GuardStats {
  has_active_mandate: boolean;
  mandate_id?: string;
  signature?: string;
  natural_language?: string;
  monthly_cap_cents: number;
  auto_approve_under_cents?: number;
  per_transaction_cap_cents?: number;
  spent_cents: number;
  reserved_cents: number;
  remaining_cents: number;
  allowed_count: number;
  escalated_count: number;
  blocked_count: number;
}

export interface GuardResult {
  decision: 'ALLOW' | 'ESCALATE' | 'BLOCK';
  status: string;
  reason_codes: string[];
  human_message: string;
  paypal_order_id?: string;
  approve_url?: string;
  pending_approval_id?: string;
  audit_event_id: string;
  amount_cents: number;
}

export interface AgentTranscriptItem {
  type: 'user' | 'thought' | 'tool_call' | 'tool_result' | 'guard_verdict' | 'agent_response' | 'error';
  text?: string;
  tool_name?: string;
  arguments?: Record<string, any>;
  result?: any;
  product_name?: string;
  merchant?: string;
  amount_cents?: number;
  decision?: 'ALLOW' | 'ESCALATE' | 'BLOCK';
  status?: string;
  reason_codes?: string[];
  human_message?: string;
  paypal_order_id?: string;
  approve_url?: string;
}

export interface AgentRunResponse {
  task: string;
  transcript: AgentTranscriptItem[];
  purchases: GuardResult[];
  success: boolean;
}

const BASE_URL = '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || JSON.stringify(errorJson);
    } catch {
      // ignore
    }
    throw new Error(errorDetail || `HTTP Error ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Mandates
  compileDraft: (text: string) =>
    request<MandateDraft>('/mandates/draft', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  activateMandate: (draft: MandateDraft) =>
    request<Mandate>('/mandates', {
      method: 'POST',
      body: JSON.stringify(draft),
    }),

  getActiveMandate: () => request<Mandate | null>('/mandates/active'),

  revokeMandate: (mandateId: string) =>
    request<Mandate>(`/mandates/${mandateId}/revoke`, {
      method: 'POST',
    }),

  // Guard & Approvals
  listPendingApprovals: () => request<PendingApproval[]>('/guard/pending'),

  approvePending: (approvalId: string) =>
    request<GuardResult>(`/guard/pending/${approvalId}/approve`, {
      method: 'POST',
    }),

  rejectPending: (approvalId: string) =>
    request<{ success: boolean; id: string; status: string }>(`/guard/pending/${approvalId}/reject`, {
      method: 'POST',
    }),

  captureOrder: (orderId: string) =>
    request<{ success: boolean; order_id: string; capture_id?: string; status: string; amount_cents: number }>(
      `/guard/capture/${orderId}`,
      { method: 'POST' }
    ),

  // Audit & Stats
  getAuditLog: () => request<AuditEvent[]>('/audit'),
  getStats: () => request<GuardStats>('/stats'),

  // Agent Run
  runAgent: (task: string) =>
    request<AgentRunResponse>('/agent/run', {
      method: 'POST',
      body: JSON.stringify({ task }),
    }),
};
