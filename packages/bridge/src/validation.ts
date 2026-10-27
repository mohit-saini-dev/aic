
import crypto from "node:crypto";

import type { ExecutionProposal, ApprovalDecision } from "./types.js";
import {
  ExecutionPolicy,
  DEFAULT_EXECUTION_POLICY,
  validateProposalPolicy
} from "./policy.js";

export function computeProposalFingerprint(
  proposal: ExecutionProposal
): string {
  const canonical = {
    proposalId: proposal.proposalId,
    taskId: proposal.taskId,
    executable: proposal.executable,
    arguments: proposal.arguments,
    workingDirectory: proposal.workingDirectory
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

export interface BindingValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateApprovalBinding(
  proposal: ExecutionProposal,
  decision: ApprovalDecision,
  projectRoot: string,
  policy: ExecutionPolicy = DEFAULT_EXECUTION_POLICY
): BindingValidationResult {
  if (
    !decision ||
    typeof decision !== "object"
  ) {
    return {
      valid: false,
      reason: "Approval decision is missing or invalid."
    };
  }

  if (decision.approved !== true) {
    return {
      valid: false,
      reason: "Proposal has not been approved."
    };
  }

  if (
    typeof decision.approvalId !== "string" ||
    decision.approvalId.trim().length === 0
  ) {
    return {
      valid: false,
      reason: "Approval ID is missing or invalid."
    };
  }

  if (
    typeof decision.decidedBy !== "string" ||
    decision.decidedBy.trim().length === 0
  ) {
    return {
      valid: false,
      reason: "Approver identity is missing or invalid."
    };
  }

  if (
    typeof decision.decidedAt !== "string" ||
    decision.decidedAt.trim().length === 0 ||
    !Number.isFinite(Date.parse(decision.decidedAt))
  ) {
    return {
      valid: false,
      reason: "Approval timestamp is missing or invalid."
    };
  }

  if (decision.proposalId !== proposal.proposalId) {
    return {
      valid: false,
      reason: "Approval proposalId mismatch."
    };
  }

  if (
    typeof decision.approvalFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(decision.approvalFingerprint)
  ) {
    return {
      valid: false,
      reason: "Approval fingerprint is missing or invalid."
    };
  }

  const currentFingerprint = computeProposalFingerprint(proposal);

  if (decision.approvalFingerprint !== currentFingerprint) {
    return {
      valid: false,
      reason:
        "Proposal content has been modified since approval (fingerprint mismatch)."
    };
  }

  const policyCheck = validateProposalPolicy(
    proposal,
    projectRoot,
    policy
  );

  if (!policyCheck.allowed) {
    return {
      valid: false,
      reason: `Policy validation failed: ${policyCheck.reason}`
    };
  }

  return { valid: true };
}
