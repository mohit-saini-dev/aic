import fs from "node:fs";
import path from "node:path";
import type { WorkflowSession } from "./workflow.js";
import type { ExecutionProposal, ApprovalDecision, ExecutionResult } from "./types.js";
import type { VerificationResult } from "./verifier.js";

export type AuditEventType =
  | "PROPOSAL_CREATED"
  | "APPROVAL_DECIDED"
  | "EXECUTION_COMPLETED"
  | "OUTCOME_VERIFIED"
  | "WORKFLOW_FINALIZED";

export interface AuditEvent {
  eventId: string;
  sessionId: string;
  proposalId: string;
  proposalFingerprint: string;
  eventType: AuditEventType;
  timestamp: string;
  actor: string;
  payload: Record<string, unknown>;
}

export interface AuditLogStore {
  version: "1.0";
  events: AuditEvent[];
}

/**
 * Creates a structured audit event.
 */
export function createAuditEvent(
  session: WorkflowSession,
  proposal: ExecutionProposal,
  eventType: AuditEventType,
  actor: string,
  payload: Record<string, unknown>
): AuditEvent {
  return {
    eventId: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    sessionId: session.sessionId,
    proposalId: proposal.proposalId,
    proposalFingerprint: session.proposalFingerprint,
    eventType,
    timestamp: new Date().toISOString(),
    actor,
    payload: sanitizePayload(payload)
  };
}

/**
 * Redacts sensitive fields or secrets from audit payloads by fully replacing them.
 */
function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = ["password", "secret", "token", "apikey", "credential"];
  
  for (const [key, value] of Object.entries(payload)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((s) => lowerKey.includes(s))) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Persists an audit event atomically to disk, ensuring failure handling.
 */
export function persistAuditEvent(
  auditLogPath: string,
  event: AuditEvent
): { success: boolean; error?: string } {
  try {
    const dir = path.dirname(auditLogPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let store: AuditLogStore = { version: "1.0", events: [] };
    if (fs.existsSync(auditLogPath)) {
      const raw = fs.readFileSync(auditLogPath, "utf-8");
      store = JSON.parse(raw);
    }

    store.events.push(event);

    // Atomic write via temporary file
    const tempPath = `${auditLogPath}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), "utf-8");
    fs.renameSync(tempPath, auditLogPath);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: `Audit persistence failed: ${err.message}` };
  }
}