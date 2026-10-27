
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  ApprovalDecision,
  ExecutionProposal
} from "./types.js";

import { createApprovalDecision } from "./approval.js";
import { computeProposalFingerprint } from "./validation.js";
import {
  createWorkflowSession,
  transitionWorkflow,
  validateWorkflowSession,
  type WorkflowSession
} from "./workflow.js";

const STORE_VERSION = 1;

type ProposalInput = Pick<
  ExecutionProposal,
  "taskId" | "executable" | "arguments"
> &
  Partial<
    Pick<
      ExecutionProposal,
      "proposalId" | "workingDirectory" | "status" | "createdAt"
    >
  >;

interface StoredProposal {
  proposal: ExecutionProposal;
  fingerprint: string;
  workflowSession: WorkflowSession;
  approval?: ApprovalDecision;
  approvalFingerprint?: string;
  updatedAt: string;
}

interface ProposalStore {
  version: typeof STORE_VERSION;
  proposals: StoredProposal[];
}

export interface ProposalSummary {
  proposalId: string;
  taskId: string;
  executable: string;
  arguments: string[];
  workingDirectory: string;
  status: ExecutionProposal["status"];
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
  workflowState: WorkflowSession["currentState"];
  approval?: ApprovalDecision;
  approvalFingerprint?: string;
}

function getStorePaths(projectRoot: string) {
  const root = path.resolve(projectRoot);
  const aicDirectory = path.join(root, ".aic");
  const statePath = path.join(aicDirectory, "state.json");

  if (
    !fs.existsSync(statePath) ||
    !fs.statSync(statePath).isFile()
  ) {
    throw new Error(
      `AIC project not initialized at ${root}. Run "aic init" first.`
    );
  }

  const realRoot = fs.realpathSync(root);
  const realAicDirectory = fs.realpathSync(aicDirectory);
  const expectedAicDirectory = path.join(realRoot, ".aic");

  if (realAicDirectory !== expectedAicDirectory) {
    throw new Error(
      "The .aic directory must not resolve outside the project root."
    );
  }

  return {
    root: realRoot,
    directory: realAicDirectory,
    storePath: path.join(realAicDirectory, "proposals.json"),
    lockPath: path.join(realAicDirectory, "proposals.json.lock")
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
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

function isWithinDirectory(root: string, target: string): boolean {
  const relative = path.relative(root, target);

  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function validateProposal(value: unknown): value is ExecutionProposal {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.proposalId === "string" &&
    value.proposalId.trim().length > 0 &&
    typeof value.taskId === "string" &&
    value.taskId.trim().length > 0 &&
    typeof value.executable === "string" &&
    value.executable.trim().length > 0 &&
    Array.isArray(value.arguments) &&
    value.arguments.every((arg) => typeof arg === "string") &&
    typeof value.workingDirectory === "string" &&
    value.workingDirectory.length > 0 &&
    isValidTimestamp(value.createdAt) &&
    [
      "PROPOSED",
      "VALIDATED",
      "AWAITING_APPROVAL",
      "APPROVED",
      "REJECTED",
      "EXECUTED",
      "FAILED"
    ].includes(String(value.status))
  );
}

function validateApprovalDecision(
  value: unknown,
  proposalId: string,
  fingerprint: string
): value is ApprovalDecision {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.proposalId === proposalId &&
    typeof value.approved === "boolean" &&
    typeof value.approvalId === "string" &&
    value.approvalId.trim().length > 0 &&
    typeof value.decidedBy === "string" &&
    value.decidedBy.trim().length > 0 &&
    isValidTimestamp(value.decidedAt) &&
    typeof value.approvalFingerprint === "string" &&
    /^[a-f0-9]{64}$/.test(value.approvalFingerprint) &&
    value.approvalFingerprint === fingerprint &&
    (value.reason === undefined || typeof value.reason === "string")
  );
}

function validateProposalWorkflowBinding(
  proposal: ExecutionProposal,
  workflowSession: WorkflowSession
): boolean {
  switch (proposal.status) {
    case "PROPOSED":
    case "VALIDATED":
    case "AWAITING_APPROVAL":
      return workflowSession.currentState === "PROPOSED";

    case "APPROVED":
      return workflowSession.currentState === "APPROVED";

    case "REJECTED":
      return workflowSession.currentState === "REJECTED";

    case "EXECUTED":
      return workflowSession.currentState === "COMPLETED_SUCCESS";

    case "FAILED":
      return (
        workflowSession.currentState === "COMPLETED_FAILED" ||
        workflowSession.currentState === "TIMED_OUT" ||
        workflowSession.currentState === "ABORTED"
      );

    default:
      return false;
  }
}

/**
 * Ensures approval history is compatible with the proposal lifecycle.
 *
 * Pending proposals must not contain an approval decision.
 * Approved and rejected proposals must contain their matching decision.
 * Executed proposals must retain a positive approval.
 * Failed proposals may lack approval only when the workflow was aborted.
 */
function validateApprovalStatusBinding(
  proposal: ExecutionProposal,
  workflowSession: WorkflowSession,
  approval: ApprovalDecision | undefined,
  approvalFingerprint: string | undefined
): boolean {
  const status = proposal.status;

  const isPending =
    status === "PROPOSED" ||
    status === "VALIDATED" ||
    status === "AWAITING_APPROVAL";

  if (isPending) {
    return approval === undefined && approvalFingerprint === undefined;
  }

  if (approval === undefined) {
    if (approvalFingerprint !== undefined) {
      return false;
    }

    if (
      status === "APPROVED" ||
      status === "REJECTED" ||
      status === "EXECUTED"
    ) {
      return false;
    }

    return (
      status === "FAILED" &&
      workflowSession.currentState === "ABORTED"
    );
  }

  if (approvalFingerprint !== computeProposalFingerprint(proposal)) {
    return false;
  }

  if (status === "REJECTED") {
    return approval.approved === false;
  }

  if (
    status === "APPROVED" ||
    status === "EXECUTED" ||
    status === "FAILED"
  ) {
    return approval.approved === true;
  }

  return false;
}

function validateStoredProposal(value: unknown): value is StoredProposal {
  if (!isRecord(value) || !validateProposal(value.proposal)) {
    return false;
  }

  if (
    typeof value.fingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.fingerprint) ||
    !validateWorkflowSession(value.workflowSession) ||
    value.workflowSession.proposalId !== value.proposal.proposalId ||
    value.workflowSession.proposalFingerprint !== value.fingerprint ||
    !validateProposalWorkflowBinding(
      value.proposal,
      value.workflowSession
    ) ||
    !isValidTimestamp(value.updatedAt)
  ) {
    return false;
  }

  if (value.approvalFingerprint !== undefined) {
    if (
      typeof value.approvalFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.approvalFingerprint) ||
      value.approvalFingerprint !== value.fingerprint
    ) {
      return false;
    }
  }

  if (value.approval !== undefined) {
    if (
      !validateApprovalDecision(
        value.approval,
        value.proposal.proposalId,
        value.fingerprint
      )
    ) {
      return false;
    }
  }

  return validateApprovalStatusBinding(
    value.proposal,
    value.workflowSession,
    value.approval as ApprovalDecision | undefined,
    value.approvalFingerprint as string | undefined
  );
}

function readStore(storePath: string): ProposalStore {
  if (!fs.existsSync(storePath)) {
    return { version: STORE_VERSION, proposals: [] };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch {
    throw new Error(
      "Proposal store is unreadable or corrupt. It was not overwritten."
    );
  }

  if (
    !isRecord(parsed) ||
    parsed.version !== STORE_VERSION ||
    !Array.isArray(parsed.proposals)
  ) {
    throw new Error(
      "Proposal store has an unsupported or invalid schema. It was not overwritten."
    );
  }

  const proposals: StoredProposal[] = [];
  const proposalIds = new Set<string>();

  for (const record of parsed.proposals) {
    if (
      isRecord(record) &&
      validateProposal(record.proposal) &&
      typeof record.fingerprint === "string"
    ) {
      const actualFingerprint = computeProposalFingerprint(
        record.proposal
      );

      if (record.fingerprint !== actualFingerprint) {
        throw new Error(
          `Proposal failed fingerprint verification: ${record.proposal.proposalId}. Store was not overwritten.`
        );
      }
    }

    if (!validateStoredProposal(record)) {
      throw new Error(
        "Proposal store contains an invalid or tampered record. It was not overwritten."
      );
    }

    const expectedFingerprint = computeProposalFingerprint(
      record.proposal
    );

    if (record.fingerprint !== expectedFingerprint) {
      throw new Error(
        `Proposal failed fingerprint verification: ${record.proposal.proposalId}. Store was not overwritten.`
      );
    }

    if (
      record.approval &&
      record.approval.approvalFingerprint !== expectedFingerprint
    ) {
      throw new Error(
        `Approval fingerprint mismatch for ${record.proposal.proposalId}. Store was not overwritten.`
      );
    }

    if (
      record.workflowSession.proposalFingerprint !== expectedFingerprint
    ) {
      throw new Error(
        `Workflow fingerprint mismatch for ${record.proposal.proposalId}. Store was not overwritten.`
      );
    }

    if (proposalIds.has(record.proposal.proposalId)) {
      throw new Error(
        `Duplicate proposal ID ${record.proposal.proposalId} in store. Store was not overwritten.`
      );
    }

    proposalIds.add(record.proposal.proposalId);
    proposals.push(record);
  }

  return {
    version: STORE_VERSION,
    proposals
  };
}

function writeStore(storePath: string, store: ProposalStore): void {
  const temporaryPath = path.join(
    path.dirname(storePath),
    `.${path.basename(storePath)}.${crypto.randomUUID()}.tmp`
  );

  let fileDescriptor: number | undefined;

  try {
    fileDescriptor = fs.openSync(temporaryPath, "wx", 0o600);

    fs.writeFileSync(
      fileDescriptor,
      JSON.stringify(store, null, 2),
      "utf8"
    );

    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;

    fs.renameSync(temporaryPath, storePath);
  } catch (error) {
    if (fileDescriptor !== undefined) {
      try {
        fs.closeSync(fileDescriptor);
      } catch {
        // Preserve the original error.
      }
    }

    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // The temporary file may not exist.
    }

    throw error;
  }
}

function sameFileIdentity(
  descriptor: number,
  filePath: string
): boolean {
  try {
    const opened = fs.fstatSync(descriptor);
    const current = fs.lstatSync(filePath);

    return (
      current.isFile() &&
      opened.dev === current.dev &&
      opened.ino === current.ino
    );
  } catch {
    return false;
  }
}

function acquireLock(lockPath: string): number {
  let descriptor: number | undefined;

  try {
    descriptor = fs.openSync(lockPath, "wx", 0o600);

    fs.writeFileSync(
      descriptor,
      JSON.stringify({
        pid: process.pid,
        createdAt: new Date().toISOString()
      }),
      "utf8"
    );

    fs.fsyncSync(descriptor);
    return descriptor;
  } catch (error) {
    if (descriptor !== undefined) {
      const ownsLock = sameFileIdentity(descriptor, lockPath);

      try {
        fs.closeSync(descriptor);
      } catch {
        // Preserve the original error.
      }

      if (ownsLock) {
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // Preserve the original error.
        }
      }
    }

    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      throw new Error(
        "Proposal store is locked by another operation. If no operation is active, inspect the lock file before removing it."
      );
    }

    throw error;
  }
}

function releaseLock(lockPath: string, descriptor: number): void {
  const ownsLock = sameFileIdentity(descriptor, lockPath);

  try {
    fs.closeSync(descriptor);
  } finally {
    if (ownsLock) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // Avoid masking the primary operation's error.
      }
    }
  }
}

function toSummary(record: StoredProposal): ProposalSummary {
  return {
    proposalId: record.proposal.proposalId,
    taskId: record.proposal.taskId,
    executable: record.proposal.executable,
    arguments: [...record.proposal.arguments],
    workingDirectory: record.proposal.workingDirectory,
    status: record.proposal.status,
    fingerprint: record.fingerprint,
    createdAt: record.proposal.createdAt,
    updatedAt: record.updatedAt,
    workflowState: record.workflowSession.currentState,
    approval: record.approval
      ? { ...record.approval }
      : undefined,
    approvalFingerprint: record.approvalFingerprint
  };
}

export function saveProposal(
  projectRoot: string,
  input: ProposalInput
): ProposalSummary {
  const paths = getStorePaths(projectRoot);
  const lockDescriptor = acquireLock(paths.lockPath);

  try {
    const store = readStore(paths.storePath);

    const workingDirectory = path.resolve(
      paths.root,
      input.workingDirectory ?? "."
    );

    if (!isWithinDirectory(paths.root, workingDirectory)) {
      throw new Error(
        "Working directory escapes project root boundary."
      );
    }

    let realWorkingDirectory: string;

    try {
      realWorkingDirectory = fs.realpathSync(workingDirectory);
    } catch {
      throw new Error(
        "Working directory must exist and resolve to a valid directory inside the project root."
      );
    }

    if (!isWithinDirectory(paths.root, realWorkingDirectory)) {
      throw new Error(
        "Working directory escapes project root boundary."
      );
    }

    if (!fs.statSync(realWorkingDirectory).isDirectory()) {
      throw new Error(
        "Working directory must resolve to a directory."
      );
    }

    const proposal: ExecutionProposal = {
      proposalId: input.proposalId ?? `proposal-${crypto.randomUUID()}`,
      taskId: input.taskId,
      executable: input.executable,
      arguments: [...input.arguments],
      workingDirectory,
      status: input.status ?? "AWAITING_APPROVAL",
      createdAt: input.createdAt ?? new Date().toISOString()
    };

    if (!validateProposal(proposal)) {
      throw new Error("Invalid proposal input.");
    }

    if (
      proposal.status !== "PROPOSED" &&
      proposal.status !== "VALIDATED" &&
      proposal.status !== "AWAITING_APPROVAL"
    ) {
      throw new Error(
        "New proposals must begin in PROPOSED, VALIDATED, or AWAITING_APPROVAL status."
      );
    }

    if (
      store.proposals.some(
        (record) => record.proposal.proposalId === proposal.proposalId
      )
    ) {
      throw new Error(`Proposal ${proposal.proposalId} already exists.`);
    }

    const fingerprint = computeProposalFingerprint(proposal);
    const initialSession = createWorkflowSession(proposal, fingerprint);

    const initialTransition = transitionWorkflow(
      initialSession,
      "PROPOSED",
      "Proposal saved for review."
    );

    if (!initialTransition.success) {
      throw new Error(
        initialTransition.error ?? "Could not initialize workflow."
      );
    }

    const record: StoredProposal = {
      proposal,
      fingerprint,
      workflowSession: initialTransition.session,
      updatedAt: new Date().toISOString()
    };

    store.proposals.push(record);
    writeStore(paths.storePath, store);

    return toSummary(record);
  } finally {
    releaseLock(paths.lockPath, lockDescriptor);
  }
}

export function listProposals(
  projectRoot: string
): ProposalSummary[] {
  const paths = getStorePaths(projectRoot);
  const store = readStore(paths.storePath);

  return store.proposals.map(toSummary);
}

/**
 * Compatibility alias for callers using the M15.6 API name.
 */
export function listStoredProposals(
  projectRoot: string
): ProposalSummary[] {
  return listProposals(projectRoot);
}

export function getProposal(
  projectRoot: string,
  proposalId: string
): ProposalSummary | undefined {
  return listProposals(projectRoot).find(
    (proposal) => proposal.proposalId === proposalId
  );
}

/**
 * Compatibility alias for callers using the earlier API name.
 */
export function getStoredProposal(
  projectRoot: string,
  proposalId: string
): ProposalSummary | undefined {
  return getProposal(projectRoot, proposalId);
}

export function updateProposalApproval(
  projectRoot: string,
  proposalId: string,
  approval: ApprovalDecision
): ProposalSummary;

export function updateProposalApproval(
  projectRoot: string,
  proposalId: string,
  approved: boolean,
  decidedBy: string,
  reason?: string
): ProposalSummary;

export function updateProposalApproval(
  projectRoot: string,
  proposalId: string,
  approvalOrApproved: ApprovalDecision | boolean,
  decidedBy?: string,
  reason?: string
): ProposalSummary {
  const paths = getStorePaths(projectRoot);
  const lockDescriptor = acquireLock(paths.lockPath);

  try {
    const store = readStore(paths.storePath);

    const record = store.proposals.find(
      (item) => item.proposal.proposalId === proposalId
    );

    if (!record) {
      throw new Error(`Proposal ${proposalId} was not found.`);
    }

    const approval =
      typeof approvalOrApproved === "boolean"
        ? createApprovalDecision(
            record.proposal,
            approvalOrApproved,
            decidedBy ?? "",
            reason
          )
        : approvalOrApproved;

    if (
      !validateApprovalDecision(
        approval,
        proposalId,
        record.fingerprint
      )
    ) {
      throw new Error(
        "Invalid approval decision or approval fingerprint mismatch."
      );
    }

    if (
      record.proposal.status !== "AWAITING_APPROVAL" &&
      record.proposal.status !== "PROPOSED" &&
      record.proposal.status !== "VALIDATED"
    ) {
      throw new Error(
        `Cannot update approval for proposal in status ${record.proposal.status}.`
      );
    }

    if (
      !validateProposalWorkflowBinding(
        record.proposal,
        record.workflowSession
      )
    ) {
      throw new Error(
        "Proposal status does not match its workflow state."
      );
    }

    const targetWorkflowState = approval.approved
      ? "APPROVED"
      : "REJECTED";

    const transition = transitionWorkflow(
      record.workflowSession,
      targetWorkflowState,
      approval.reason ?? (approval.approved ? "Approved." : "Rejected.")
    );

    if (!transition.success) {
      throw new Error(
        transition.error ?? "Invalid workflow transition for approval."
      );
    }

    const updatedProposal: ExecutionProposal = {
      ...record.proposal,
      status: approval.approved ? "APPROVED" : "REJECTED"
    };

    if (
      computeProposalFingerprint(updatedProposal) !== record.fingerprint
    ) {
      throw new Error(
        "Proposal fingerprint changed unexpectedly during approval."
      );
    }

    record.proposal = updatedProposal;
    record.workflowSession = transition.session;
    record.approval = { ...approval };
    record.approvalFingerprint = record.fingerprint;
    record.updatedAt = new Date().toISOString();

    writeStore(paths.storePath, store);

    return toSummary(record);
  } finally {
    releaseLock(paths.lockPath, lockDescriptor);
  }
}
