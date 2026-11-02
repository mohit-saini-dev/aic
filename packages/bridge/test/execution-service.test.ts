
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  listProposals,
  saveProposal,
  transitionWorkflow,
  updateProposalApproval
} from "../dist/index.js";

test("approved proposal remains readable while workflow is executing", () => {
  const projectRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "aic-execution-service-")
  );
  const aicDirectory = path.join(projectRoot, ".aic");

  fs.mkdirSync(aicDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(aicDirectory, "state.json"),
    "{}",
    "utf8"
  );

  try {
    const proposal = saveProposal(projectRoot, {
      proposalId: "proposal-execution-regression",
      taskId: "task-execution-regression",
      executable: process.execPath,
      arguments: ["-e", "process.exit(0)"],
      workingDirectory: "."
    });

    updateProposalApproval(
      projectRoot,
      proposal.proposalId,
      true,
      "test-operator"
    );

    const storePath = path.join(aicDirectory, "proposals.json");
    const store = JSON.parse(fs.readFileSync(storePath, "utf8"));

    const record = store.proposals.find(
      (item: { proposal: { proposalId: string } }) =>
        item.proposal.proposalId === proposal.proposalId
    );

    assert.ok(record, "approved proposal should exist in the store");
    assert.equal(record.proposal.status, "APPROVED");
    assert.equal(record.workflowSession.currentState, "APPROVED");

    const transition = transitionWorkflow(
      record.workflowSession,
      "EXECUTING",
      "Execution started."
    );

    assert.equal(transition.success, true);

    record.workflowSession = transition.session;
   record.updatedAt = transition.session.updatedAt;

    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");

    const proposals = listProposals(projectRoot);
    const stored = proposals.find(
      (item) => item.proposalId === proposal.proposalId
    );

    assert.ok(stored, "executing proposal should remain readable");
    assert.equal(stored.status, "APPROVED");
    assert.equal(stored.workflowState, "EXECUTING");
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
