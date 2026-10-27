
import type { ExecutionProposal } from "./types.js";

export type WorkflowState =
  | "PENDING_PROPOSAL"
  | "PROPOSED"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "VERIFYING"
  | "COMPLETED_SUCCESS"
  | "COMPLETED_FAILED"
  | "TIMED_OUT"
  | "ABORTED";

export interface WorkflowTransition {
  from: WorkflowState;
  to: WorkflowState;
  timestamp: string;
  reason?: string;
}

export interface WorkflowSession {
  sessionId: string;
  proposalId: string;
  proposalFingerprint: string;
  currentState: WorkflowState;
  createdAt: string;
  updatedAt: string;
  transitions: WorkflowTransition[];
}

const VALID_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  PENDING_PROPOSAL: ["PROPOSED", "ABORTED"],
  PROPOSED: ["APPROVED", "REJECTED", "ABORTED"],
  APPROVED: ["EXECUTING", "ABORTED"],
  EXECUTING: [
    "VERIFYING",
    "TIMED_OUT",
    "COMPLETED_FAILED",
    "ABORTED"
  ],
  VERIFYING: ["COMPLETED_SUCCESS", "COMPLETED_FAILED", "ABORTED"],
  REJECTED: [],
  COMPLETED_SUCCESS: [],
  COMPLETED_FAILED: [],
  TIMED_OUT: [],
  ABORTED: []
};

const WORKFLOW_STATES = Object.keys(
  VALID_TRANSITIONS
) as WorkflowState[];

function isWorkflowRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isValidTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

/**
 * Validates the structure and internal consistency of a stored workflow
 * session, including its state-transition history.
 *
 * This validates consistency, not cryptographic authenticity.
 */
export function validateWorkflowSession(
  value: unknown
): value is WorkflowSession {
  if (!isWorkflowRecord(value)) {
    return false;
  }

  if (
    typeof value.sessionId !== "string" ||
    value.sessionId.trim().length === 0 ||
    typeof value.proposalId !== "string" ||
    value.proposalId.trim().length === 0 ||
    typeof value.proposalFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.proposalFingerprint) ||
    typeof value.currentState !== "string" ||
    !WORKFLOW_STATES.includes(value.currentState as WorkflowState) ||
    !isValidTimestamp(value.createdAt) ||
    !isValidTimestamp(value.updatedAt) ||
    !Array.isArray(value.transitions)
  ) {
    return false;
  }

  let expectedState: WorkflowState = "PENDING_PROPOSAL";
  let previousTimestamp = Date.parse(value.createdAt);

  for (const item of value.transitions) {
    if (!isWorkflowRecord(item)) {
      return false;
    }

    if (
      typeof item.from !== "string" ||
      !WORKFLOW_STATES.includes(item.from as WorkflowState) ||
      typeof item.to !== "string" ||
      !WORKFLOW_STATES.includes(item.to as WorkflowState) ||
      !isValidTimestamp(item.timestamp) ||
      (item.reason !== undefined &&
        typeof item.reason !== "string")
    ) {
      return false;
    }

    const from = item.from as WorkflowState;
    const to = item.to as WorkflowState;
    const transitionTime = Date.parse(item.timestamp);

    if (
      from !== expectedState ||
      !VALID_TRANSITIONS[from].includes(to) ||
      transitionTime < previousTimestamp
    ) {
      return false;
    }

    expectedState = to;
    previousTimestamp = transitionTime;
  }

  if (expectedState !== value.currentState) {
    return false;
  }

  const updatedTimestamp = Date.parse(value.updatedAt);

  if (updatedTimestamp !== previousTimestamp) {
    return false;
  }

  // A session with no transitions must retain its creation timestamp.
  if (
    value.transitions.length === 0 &&
    updatedTimestamp !== Date.parse(value.createdAt)
  ) {
    return false;
  }

  return true;
}

export function createWorkflowSession(
  proposal: ExecutionProposal,
  proposalFingerprint: string
): WorkflowSession {
  const now = new Date().toISOString();

  return {
    sessionId: `session-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 7)}`,
    proposalId: proposal.proposalId,
    proposalFingerprint,
    currentState: "PENDING_PROPOSAL",
    createdAt: now,
    updatedAt: now,
    transitions: []
  };
}

export function transitionWorkflow(
  session: WorkflowSession,
  targetState: WorkflowState,
  reason?: string
): {
  success: boolean;
  error?: string;
  session: WorkflowSession;
} {
  const allowedNextStates = VALID_TRANSITIONS[session.currentState];

  if (!allowedNextStates?.includes(targetState)) {
    return {
      success: false,
      error: `Illegal state transition from '${session.currentState}' to '${targetState}'.`,
      session
    };
  }

  const now = new Date().toISOString();

  const transition: WorkflowTransition = {
    from: session.currentState,
    to: targetState,
    timestamp: now,
    ...(reason === undefined ? {} : { reason })
  };

  const updatedSession: WorkflowSession = {
    ...session,
    currentState: targetState,
    updatedAt: now,
    transitions: [...session.transitions, transition]
  };

  return {
    success: true,
    session: updatedSession
  };
}

export function verifyWorkflowBinding(
  session: WorkflowSession,
  proposal: ExecutionProposal,
  currentFingerprint: string
): { valid: boolean; reason?: string } {
  if (session.proposalId !== proposal.proposalId) {
    return {
      valid: false,
      reason: "Proposal ID mismatch in workflow session binding."
    };
  }

  if (session.proposalFingerprint !== currentFingerprint) {
    return {
      valid: false,
      reason: "Proposal fingerprint mismatch in workflow session binding."
    };
  }

  return { valid: true };
}
