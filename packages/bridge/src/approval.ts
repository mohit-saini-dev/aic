
import crypto from "node:crypto";

import type {
  ExecutionProposal,
  ApprovalDecision
} from "./types.js";

import { computeProposalFingerprint } from "./validation.js";

function isValidTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

/**
 * Checks that an approval decision is structurally valid and bound to
 * the current proposal contents.
 *
 * This does not independently authenticate the identity of the approver.
 */
export function validateProposalIntegrity(
  proposal: ExecutionProposal,
  decision: ApprovalDecision
): boolean {
  if (
    !decision ||
    typeof decision !== "object" ||
    decision.proposalId !== proposal.proposalId ||
    decision.approved !== true ||
    typeof decision.approvalId !== "string" ||
    decision.approvalId.trim().length === 0 ||
    typeof decision.decidedBy !== "string" ||
    decision.decidedBy.trim().length === 0 ||
    !isValidTimestamp(decision.decidedAt) ||
    (decision.reason !== undefined &&
      typeof decision.reason !== "string")
  ) {
    return false;
  }

  if (
    typeof decision.approvalFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(decision.approvalFingerprint)
  ) {
    return false;
  }

  if (
    decision.approvalFingerprint !==
    computeProposalFingerprint(proposal)
  ) {
    return false;
  }

  return (
    proposal.status === "AWAITING_APPROVAL" ||
    proposal.status === "VALIDATED"
  );
}

export function createApprovalDecision(
  proposal: ExecutionProposal,
  approved: boolean,
  decidedBy: string,
  reason?: string
): ApprovalDecision {
  if (
    typeof decidedBy !== "string" ||
    decidedBy.trim().length === 0
  ) {
    throw new Error("Invalid approval decision: an explicit approver identity is required.");
  }

  if (reason !== undefined && typeof reason !== "string") {
    throw new Error("Approval reason must be a string when provided.");
  }

  return {
    approvalId: `approval-${crypto.randomUUID()}`,
    proposalId: proposal.proposalId,
    approved,
    decidedBy: decidedBy.trim(),
    decidedAt: new Date().toISOString(),
    approvalFingerprint: computeProposalFingerprint(proposal),
    ...(reason === undefined ? {} : { reason })
  };
}
