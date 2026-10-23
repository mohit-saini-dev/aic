import crypto from "node:crypto";
import { ExecutionProposal, ApprovalDecision } from "./types.js";
import { ExecutionPolicy, DEFAULT_EXECUTION_POLICY, validateProposalPolicy } from "./policy.js";

/**
 * Generates a cryptographic content hash for a proposal to ensure
 * that changing any parameter (executable, args, workdir) invalidates any approval.
 */
export function computeProposalFingerprint(proposal: ExecutionProposal): string {
  const canonical = {
    proposalId: proposal.proposalId,
    taskId: proposal.taskId,
    executable: proposal.executable,
    arguments: proposal.arguments,
    workingDirectory: proposal.workingDirectory
  };
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export interface BindingValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Ensures that an approval decision is strictly bound to the exact proposal content,
 * has not expired or been tampered with, and passes current policy validation.
 */
export function validateApprovalBinding(
  proposal: ExecutionProposal,
  decision: ApprovalDecision & { approvalFingerprint?: string },
  projectRoot: string,
  policy: ExecutionPolicy = DEFAULT_EXECUTION_POLICY
): BindingValidationResult {
  // Rule 1: No approval, no execution
  if (!decision || !decision.approved) {
    return { valid: false, reason: "Proposal has not been approved." };
  }

  // Rule 2: Approval applies to one exact proposal ID
  if (decision.proposalId !== proposal.proposalId) {
    return { valid: false, reason: "Approval proposalId mismatch." };
  }

  // Rule 3: Cryptographic binding - verify that proposal content has not changed since approval
  if (decision.approvalFingerprint) {
    const currentFingerprint = computeProposalFingerprint(proposal);
    if (decision.approvalFingerprint !== currentFingerprint) {
      return {
        valid: false,
        reason: "Proposal content has been modified since approval (fingerprint mismatch)."
      };
    }
  }

  // Revalidate policy immediately before execution (Rule 5)
  const policyCheck = validateProposalPolicy(proposal, projectRoot, policy);
  if (!policyCheck.allowed) {
    return { valid: false, reason: `Policy validation failed: ${policyCheck.reason}` };
  }

  return { valid: true };
}