import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  ApprovalDecision,
  ExecutionProposal
} from "./types.js";

import { computeProposalFingerprint } from "./validation.js";
import {
  createWorkflowSession,
  transitionWorkflow,
  type WorkflowSession
} from "./workflow.js";

const STORE_VERSION = 1;

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

  if (!fs.existsSync(statePath) || !fs.statSync(statePath).isFile()) {
    throw new Error(
      `AIC project not initialized at ${root}. Run "aic init" first.`
    );
  }

  const realRoot = fs.realpathSync(root);
  const realAicDirectory = fs.realpathSync(aicDirectory);
  const expectedAicDirectory = path.join(realRoot, ".aic");

  if (realAicDirectory !== expectedAicDirectory) {
    throw new Error("The .aic directory must not resolve outside the project root.");
  }

  return {
    directory: realAicDirectory,
    storePath: path.join(realAicDirectory, "proposals.json"),
    lockPath: path.join(realAicDirectory, "proposals.json.lock")
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateProposal(value: unknown): value is ExecutionProposal {
  if (!isRecord(value)) return false;

  return (
    typeof value.proposalId === "string" &&
    value.proposalId.length > 0 &&
    typeof value.taskId === "string" &&
    typeof value.executable === "string" &&
    value.executable.length > 0 &&
    Array.isArray(value.arguments) &&
    value.arguments.every((arg) => typeof arg === "string") &&
    typeof value.workingDirectory === "string" &&
    typeof value.createdAt === "string" &&
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

function validateStoredProposal(value: unknown): value is StoredProposal {
  if (!isRecord(value) || !validateProposal(value.proposal)) {
    return false;
  }

  if (
    typeof value.fingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.fingerprint) ||
    !isRecord(value.workflowSession) ||
    value.workflowSession.proposalId !== value.proposal.proposalId ||
    typeof value.updatedAt !== "string"
  ) {
    return false;
  }

  if (
    value.approval !== undefined &&
    (!isRecord(value.approval) ||
      value.approval.proposalId !== value.proposal.proposalId ||
      typeof value.approval.approved !== "boolean" ||
      typeof value.approval.approvalId !== "string" ||
      typeof value.approval.decidedBy !== "string" ||
      typeof value.approval.decidedAt !== "string")
  ) {
    return false;
  }

  return true;
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
    !Array.isArray(parsed.proposals) ||
    !parsed.proposals.every(validateStoredProposal)
  ) {
    throw new Error(
      "Proposal store schema validation failed. It was not overwritten."
    );
  }

  const store = parsed as unknown as ProposalStore;
  const seenIds = new Set<string>();

  for (const record of store.proposals) {
    if (seenIds.has(record.proposal.proposalId)) {
      throw new Error("Proposal store contains duplicate proposal IDs.");
    }

    seenIds.add(record.proposal.proposalId);

    const currentFingerprint = computeProposalFingerprint(record.proposal);

    if (currentFingerprint !== record.fingerprint) {
      throw new Error(
        `Proposal ${record.proposal.proposalId} failed fingerprint verification.`
      );
    }

    if (
      record.approvalFingerprint !== undefined &&
      !/^[a-f0-9]{64}$/.test(record.approvalFingerprint)
    ) {
      throw new Error(
        `Proposal ${record.proposal.proposalId} has an invalid approval fingerprint.`
      );
    }

    if (
      record.workflowSession.proposalFingerprint !== record.fingerprint
    ) {
      throw new Error(
        `Proposal ${record.proposal.proposalId} has a mismatched workflow fingerprint.`
      );
    }
  }

  return store;
}

function writeStoreAtomically(
  storePath: string,
  store: ProposalStore
): void {
  const temporaryPath =
    `${storePath}.${process.pid}.${crypto.randomUUID()}.tmp`;

  let fd: number | undefined;

  try {
    fd = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify(store, null, 2) + "\n", "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;

    fs.renameSync(temporaryPath, storePath);
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }

    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }
  }
}

function withStoreLock<T>(
  projectRoot: string,
  operation: (storePath: string) => T
): T {
  const { directory, storePath, lockPath } = getStorePaths(projectRoot);

  let lockFd: number;

  try {
    lockFd = fs.openSync(lockPath, "wx", 0o600);
    fs.writeSync(lockFd, JSON.stringify({
      pid: process.pid,
      createdAt: new Date().toISOString()
    }));
    fs.fsyncSync(lockFd);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `Proposal store is locked (${lockPath}). ` +
        "Do not delete the lock while another AIC process may be writing."
      );
    }

    throw error;
  }

  try {
    return operation(storePath);
  } finally {
    fs.closeSync(lockFd);

    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }

    void directory;
  }
}

export function listStoredProposals(
  projectRoot: string
): ProposalSummary[] {
  const { storePath } = getStorePaths(projectRoot);
  const store = readStore(storePath);

  return store.proposals.map((record) => ({
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
    approval: record.approval,
    approvalFingerprint: record.approvalFingerprint
  }));
}

export function getStoredProposal(
  projectRoot: string,
  proposalId: string
): ProposalSummary | undefined {
  return listStoredProposals(projectRoot).find(
    (record) => record.proposalId === proposalId
  );
}

export function saveProposal(
  projectRoot: string,
  proposalInput: Omit<
    ExecutionProposal,
    "proposalId" | "status" | "createdAt" | "workingDirectory"
  > & { proposalId?: string }
): ProposalSummary {
  return withStoreLock(projectRoot, (storePath) => {
    const store = readStore(storePath);

    const proposalId =
      proposalInput.proposalId ?? `prop-${crypto.randomUUID()}`;

    if (store.proposals.some(
      (record) => record.proposal.proposalId === proposalId
    )) {
      throw new Error(`Proposal ID already exists: ${proposalId}`);
    }

    const root = fs.realpathSync(path.resolve(projectRoot));

    const proposal: ExecutionProposal = {
      proposalId,
      taskId: proposalInput.taskId,
      executable: proposalInput.executable,
      arguments: [...proposalInput.arguments],
      workingDirectory: root,
      status: "AWAITING_APPROVAL",
      createdAt: new Date().toISOString()
    };

    const fingerprint = computeProposalFingerprint(proposal);
    let workflowSession = createWorkflowSession(proposal, fingerprint);

    const transition = transitionWorkflow(workflowSession, "PROPOSED");

    if (!transition.success) {
      throw new Error(
        transition.error ?? "Could not initialize proposal workflow."
      );
    }

    workflowSession = transition.session;

    const record: StoredProposal = {
      proposal,
      fingerprint,
      workflowSession,
      updatedAt: new Date().toISOString()
    };

    store.proposals.push(record);
    writeStoreAtomically(storePath, store);

    return {
      proposalId: proposal.proposalId,
      taskId: proposal.taskId,
      executable: proposal.executable,
      arguments: [...proposal.arguments],
      workingDirectory: proposal.workingDirectory,
      status: proposal.status,
      fingerprint,
      createdAt: proposal.createdAt,
      updatedAt: record.updatedAt,
      workflowState: workflowSession.currentState
    };
  });
}

export function updateProposalApproval(
  projectRoot: string,
  proposalId: string,
  approved: boolean,
  decidedBy: string = "operator",
  reason?: string
): ProposalSummary {
  return withStoreLock(projectRoot, (storePath) => {
    const store = readStore(storePath);
    const record = store.proposals.find((p) => p.proposal.proposalId === proposalId);
    
    if (!record) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    const decision: ApprovalDecision = {
      approvalId: `approval-${crypto.randomUUID()}`,
      proposalId,
      approved,
      decidedBy,
      decidedAt: new Date().toISOString(),
      reason
    };

    record.approval = decision;
    record.approvalFingerprint = record.fingerprint;
    record.proposal.status = approved ? "APPROVED" : "REJECTED";

    const targetState = approved ? "APPROVED" : "REJECTED";
    const transition = transitionWorkflow(record.workflowSession, targetState, reason);
    if (!transition.success) {
      throw new Error(transition.error ?? `Invalid workflow transition to ${targetState}`);
    }
    
    record.workflowSession = transition.session;
    record.updatedAt = new Date().toISOString();

    writeStoreAtomically(storePath, store);

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
      approval: record.approval,
      approvalFingerprint: record.approvalFingerprint
    };
  });
}