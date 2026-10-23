import { readState, compileContext } from "@aic/core";
import { saveProposal } from "@aic/bridge";
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

  try {
    const summary = saveProposal(root, {
      taskId: proposalInput.taskId,
      executable: proposalInput.executable,
      arguments: proposalInput.arguments
    });

    return {
      success: true,
      message: "Proposal submitted successfully, durably persisted, and queued for operator review.",
      proposalId: summary.proposalId,
      proposalFingerprint: summary.fingerprint,
      status: summary.status
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to persist proposal: ${err.message}`
    };
  }
}