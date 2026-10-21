export type ProposalStatus = "PROPOSED" | "VALIDATED" | "AWAITING_APPROVAL" | "APPROVED" | "REJECTED" | "EXECUTED" | "FAILED";

export interface AgentTask {
  taskId: string;
  title?: string;
  objective: string;
  constraints: string[];
  relevantFiles: string[];
  contextFingerprint?: string;
}

export interface ExecutionProposal {
  proposalId: string;
  taskId: string;
  executable: string;
  arguments: string[];
  workingDirectory: string;
  status: ProposalStatus;
  createdAt: string;
}

export interface ApprovalDecision {
  approvalId: string;
  proposalId: string;
  approved: boolean;
  decidedBy: string;
  decidedAt: string;
  reason?: string;
}

export interface ExecutionResult {
  proposalId: string;
  approvalId: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
  changedFiles: string[];
  diffSummary: string;
  verificationStatus: "PASSED" | "FAILED" | "INCOMPLETE" | "NOT_RUN";
}

export interface AgentHandoff {
  schemaVersion: "1.0";
  handoffId: string;
  task: AgentTask;
  compiledContext: unknown;
  provenance: {
    projectRoot: string;
    compilerVersion: string;
    compiledAt: string;
  };
  fingerprint: string;
}

export interface HandoffOptions {
  includeMemories?: boolean;
  maxCharacters?: number;
}