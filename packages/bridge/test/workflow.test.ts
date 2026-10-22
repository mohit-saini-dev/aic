import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { ExecutionProposal } from "../dist/index.js";
import { 
  createWorkflowSession, 
  transitionWorkflow, 
  verifyWorkflowBinding 
} from "../dist/index.js";

describe("M13.1 Workflow State Machine & Contracts", () => {
  const sampleProposal: ExecutionProposal = {
    proposalId: "prop-wf-001",
    taskId: "task-001",
    executable: "node",
    arguments: ["-e", "console.log('workflow')"],
    workingDirectory: ".",
    status: "PROPOSED",
    createdAt: new Date().toISOString()
  };

  const sampleFingerprint = "sha256-abc123mockfingerprint";

  test("creates valid initial workflow session in PENDING_PROPOSAL", () => {
    const session = createWorkflowSession(sampleProposal, sampleFingerprint);
    assert.equal(session.proposalId, sampleProposal.proposalId);
    assert.equal(session.proposalFingerprint, sampleFingerprint);
    assert.equal(session.currentState, "PENDING_PROPOSAL");
    assert.equal(session.transitions.length, 0);
  });

  test("allows legal state transitions sequentially", () => {
    let session = createWorkflowSession(sampleProposal, sampleFingerprint);

    let res = transitionWorkflow(session, "PROPOSED", "Proposal generated");
    assert.equal(res.success, true);
    session = res.session;
    assert.equal(session.currentState, "PROPOSED");

    res = transitionWorkflow(session, "APPROVED", "Operator approved");
    assert.equal(res.success, true);
    session = res.session;
    assert.equal(session.currentState, "APPROVED");

    res = transitionWorkflow(session, "EXECUTING", "Starting execution");
    assert.equal(res.success, true);
    session = res.session;
    assert.equal(session.currentState, "EXECUTING");

    res = transitionWorkflow(session, "VERIFYING", "Execution completed, verifying");
    assert.equal(res.success, true);
    session = res.session;
    assert.equal(session.currentState, "VERIFYING");

    res = transitionWorkflow(session, "COMPLETED_SUCCESS", "Verification passed");
    assert.equal(res.success, true);
    session = res.session;
    assert.equal(session.currentState, "COMPLETED_SUCCESS");
    assert.equal(session.transitions.length, 5);
  });

  test("rejects illegal state transitions", () => {
    const session = createWorkflowSession(sampleProposal, sampleFingerprint);
    const res = transitionWorkflow(session, "APPROVED", "Illegal jump");
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("Illegal state transition"));
    assert.equal(res.session.currentState, "PENDING_PROPOSAL");
  });

  test("prevents transitions out of terminal states", () => {
    let session = createWorkflowSession(sampleProposal, sampleFingerprint);
    session = transitionWorkflow(session, "PROPOSED").session;
    session = transitionWorkflow(session, "REJECTED", "Denied").session;

    assert.equal(session.currentState, "REJECTED");

    const res = transitionWorkflow(session, "APPROVED", "Trying to reopen");
    assert.equal(res.success, false);
    assert.equal(session.currentState, "REJECTED");
  });

  test("verifies immutable proposal binding and detects tampering", () => {
    const session = createWorkflowSession(sampleProposal, sampleFingerprint);

    const checkValid = verifyWorkflowBinding(session, sampleProposal, sampleFingerprint);
    assert.equal(checkValid.valid, true);

    const wrongIdProposal: ExecutionProposal = {
      ...sampleProposal,
      proposalId: "prop-wrong-id"
    };
    const checkIdMismatch = verifyWorkflowBinding(session, wrongIdProposal, sampleFingerprint);
    assert.equal(checkIdMismatch.valid, false);

    const checkFingerprint = verifyWorkflowBinding(session, sampleProposal, "wrong-fingerprint");
    assert.equal(checkFingerprint.valid, false);
  });
});