import { ExecutionProposal, ApprovalDecision } from "./types.js";

export function validateProposalIntegrity(
  proposal: ExecutionProposal,
  decision: ApprovalDecision
): boolean {
  if (decision.proposalId !== proposal.proposalId) {
    return false;
  }
  if (!decision.approved) {
    return false;
  }
  return proposal.status === "AWAITING_APPROVAL" || proposal.status === "VALIDATED";
}

export function createApprovalDecision(
  proposal: ExecutionProposal,
  approved: boolean,
  decidedBy: string,
  reason?: string
): ApprovalDecision {
  return {
    approvalId: `approval-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    proposalId: proposal.proposalId,
    approved,
    decidedBy,
    decidedAt: new Date().toISOString(),
    reason
  };
}