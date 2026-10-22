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
  EXECUTING: ["VERIFYING", "TIMED_OUT", "COMPLETED_FAILED", "ABORTED"],
  VERIFYING: ["COMPLETED_SUCCESS", "COMPLETED_FAILED", "ABORTED"],
  REJECTED: [],
  COMPLETED_SUCCESS: [],
  COMPLETED_FAILED: [],
  TIMED_OUT: [],
  ABORTED: []
};

export function createWorkflowSession(
  proposal: ExecutionProposal,
  proposalFingerprint: string
): WorkflowSession {
  const now = new Date().toISOString();
  return {
    sessionId: `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
): { success: boolean; error?: string; session: WorkflowSession } {
  const allowedNextStates = VALID_TRANSITIONS[session.currentState];

  if (!allowedNextStates.includes(targetState)) {
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
    reason
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
    return { valid: false, reason: "Proposal ID mismatch in workflow session binding." };
  }
  if (session.proposalFingerprint !== currentFingerprint) {
    return { valid: false, reason: "Proposal fingerprint tampered; binding integrity violated." };
  }
  return { valid: true };
}