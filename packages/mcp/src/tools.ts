import { readState, compileContext } from "@aic/core";
import { computeProposalFingerprint } from "@aic/bridge";
import type { ExecutionProposal } from "@aic/bridge";
import { validateProjectRoot } from "./security.js";

export function getProjectSummaryTool(projectRoot?: string) {
  const root = validateProjectRoot(projectRoot);
  const state = readState(root);
  return {
    project: state.project,
    version: state.version,
    updatedAt: state.updatedAt
  };
}

export function getCurrentTaskTool(projectRoot?: string) {
  const root = validateProjectRoot(projectRoot);
  const state = readState(root);
  return {
    currentTask: state.currentTask
  };
}

export function listDecisionsTool(projectRoot?: string) {
  const root = validateProjectRoot(projectRoot);
  const state = readState(root);
  return {
    decisions: state.decisions
  };
}

export function listIssuesTool(projectRoot?: string) {
  const root = validateProjectRoot(projectRoot);
  const state = readState(root);
  return {
    issues: state.issues
  };
}

export function getConstraintsTool(projectRoot?: string) {
  const root = validateProjectRoot(projectRoot);
  const state = readState(root);
  return {
    constraints: state.constraints
  };
}

export function getRelevantFilesTool(projectRoot?: string) {
  const root = validateProjectRoot(projectRoot);
  const state = readState(root);
  return {
    relevantFiles: state.relevantFiles
  };
}

export async function compileContextTool(projectRoot?: string, maxCharacters?: number) {
  const root = validateProjectRoot(projectRoot);
  return await compileContext(root, { maxCharacters });
}

export function submitProposalTool(
  proposalInput: Omit<ExecutionProposal, "proposalId" | "status" | "createdAt" | "workingDirectory">,
  projectRoot?: string
) {
  const root = validateProjectRoot(projectRoot);

  if (!proposalInput.executable || !proposalInput.arguments) {
    return {
      success: false,
      error: "Invalid proposal: executable and arguments are required."
    };
  }

  const proposal: ExecutionProposal = {
    proposalId: `prop-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    ...proposalInput,
    workingDirectory: root,
    status: "AWAITING_APPROVAL",
    createdAt: new Date().toISOString()
  };

  const fingerprint = computeProposalFingerprint(proposal);

  return {
    success: true,
    message: "Proposal submitted successfully and queued for operator review.",
    proposalId: proposal.proposalId,
    proposalFingerprint: fingerprint,
    status: proposal.status
  };
}