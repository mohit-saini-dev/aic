
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import type { ExecutionProposal } from "../dist/index.js";

import {
  createWorkflowSession,
  transitionWorkflow,
  verifyWorkflowBinding,
  validateWorkflowSession
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
    const session = createWorkflowSession(
      sampleProposal,
      sampleFingerprint
    );

    assert.equal(session.proposalId, sampleProposal.proposalId);
    assert.equal(session.proposalFingerprint, sampleFingerprint);
    assert.equal(session.currentState, "PENDING_PROPOSAL");
    assert.equal(session.transitions.length, 0);
  });

  test("allows legal state transitions sequentially", () => {
    let session = createWorkflowSession(
      sampleProposal,
      sampleFingerprint
    );

    let res = transitionWorkflow(
      session,
      "PROPOSED",
      "Proposal generated"
    );
    assert.equal(res.success, true);
    session = res.session;
    assert.equal(session.currentState, "PROPOSED");

    res = transitionWorkflow(
      session,
      "APPROVED",
      "Operator approved"
    );
    assert.equal(res.success, true);
    session = res.session;
    assert.equal(session.currentState, "APPROVED");

    res = transitionWorkflow(
      session,
      "EXECUTING",
      "Starting execution"
    );
    assert.equal(res.success, true);
    session = res.session;
    assert.equal(session.currentState, "EXECUTING");

    res = transitionWorkflow(
      session,
      "VERIFYING",
      "Execution completed, verifying"
    );
    assert.equal(res.success, true);
    session = res.session;
    assert.equal(session.currentState, "VERIFYING");

    res = transitionWorkflow(
      session,
      "COMPLETED_SUCCESS",
      "Verification passed"
    );
    assert.equal(res.success, true);
    session = res.session;
    assert.equal(session.currentState, "COMPLETED_SUCCESS");
    assert.equal(session.transitions.length, 5);
  });

  test("rejects illegal state transitions", () => {
    const session = createWorkflowSession(
      sampleProposal,
      sampleFingerprint
    );

    const res = transitionWorkflow(
      session,
      "APPROVED",
      "Illegal jump"
    );

    assert.equal(res.success, false);
    assert.ok(res.error?.includes("Illegal state transition"));
    assert.equal(res.session.currentState, "PENDING_PROPOSAL");
  });

  test("prevents transitions out of terminal states", () => {
    let session = createWorkflowSession(
      sampleProposal,
      sampleFingerprint
    );

    session = transitionWorkflow(session, "PROPOSED").session;
    session = transitionWorkflow(
      session,
      "REJECTED",
      "Denied"
    ).session;

    assert.equal(session.currentState, "REJECTED");

    const res = transitionWorkflow(
      session,
      "APPROVED",
      "Trying to reopen"
    );

    assert.equal(res.success, false);
    assert.equal(session.currentState, "REJECTED");
  });

  test("verifies immutable proposal binding and detects tampering", () => {
    const session = createWorkflowSession(
      sampleProposal,
      sampleFingerprint
    );

    const checkValid = verifyWorkflowBinding(
      session,
      sampleProposal,
      sampleFingerprint
    );
    assert.equal(checkValid.valid, true);

    const wrongIdProposal: ExecutionProposal = {
      ...sampleProposal,
      proposalId: "prop-wrong-id"
    };

    const checkIdMismatch = verifyWorkflowBinding(
      session,
      wrongIdProposal,
      sampleFingerprint
    );
    assert.equal(checkIdMismatch.valid, false);

    const checkFingerprint = verifyWorkflowBinding(
      session,
      sampleProposal,
      "wrong-fingerprint"
    );
    assert.equal(checkFingerprint.valid, false);
  });

  // M15.7 workflow-session validation tests.

  test("validates an initial workflow session", () => {
    const session = createWorkflowSession(
      sampleProposal,
      "a".repeat(64)
    );

    assert.equal(validateWorkflowSession(session), true);
  });

  test("validates a session with legal transitions", () => {
    let session = createWorkflowSession(
      sampleProposal,
      "b".repeat(64)
    );

    session = transitionWorkflow(
      session,
      "PROPOSED"
    ).session;

    session = transitionWorkflow(
      session,
      "APPROVED"
    ).session;

    assert.equal(validateWorkflowSession(session), true);
  });

  test("rejects a session whose current state disagrees with its history", () => {
    const session = createWorkflowSession(
      sampleProposal,
      "c".repeat(64)
    );

    const invalidSession = {
      ...session,
      currentState: "APPROVED" as const
    };

    assert.equal(
      validateWorkflowSession(invalidSession),
      false
    );
  });

  test("rejects an illegal transition in stored history", () => {
    const session = createWorkflowSession(
      sampleProposal,
      "d".repeat(64)
    );

    const invalidSession = {
      ...session,
      currentState: "APPROVED" as const,
      updatedAt: session.createdAt,
      transitions: [
        {
          from: "PENDING_PROPOSAL" as const,
          to: "APPROVED" as const,
          timestamp: session.createdAt
        }
      ]
    };

    assert.equal(
      validateWorkflowSession(invalidSession),
      false
    );
  });

  test("rejects a transition history with decreasing timestamps", () => {
    const session = createWorkflowSession(
      sampleProposal,
      "e".repeat(64)
    );

    const firstTime = Date.parse(session.createdAt) + 2_000;
    const secondTime = firstTime - 1_000;

    const invalidSession = {
      ...session,
      currentState: "APPROVED" as const,
      updatedAt: new Date(secondTime).toISOString(),
      transitions: [
        {
          from: "PENDING_PROPOSAL" as const,
          to: "PROPOSED" as const,
          timestamp: new Date(firstTime).toISOString()
        },
        {
          from: "PROPOSED" as const,
          to: "APPROVED" as const,
          timestamp: new Date(secondTime).toISOString()
        }
      ]
    };

    assert.equal(
      validateWorkflowSession(invalidSession),
      false
    );
  });

  test("rejects updatedAt when it does not match the last transition", () => {
    let session = createWorkflowSession(
      sampleProposal,
      "f".repeat(64)
    );

    session = transitionWorkflow(
      session,
      "PROPOSED"
    ).session;

    const invalidSession = {
      ...session,
      updatedAt: new Date(
        Date.parse(session.updatedAt) + 60_000
      ).toISOString()
    };

    assert.equal(
      validateWorkflowSession(invalidSession),
      false
    );
  });

  test("rejects a malformed workflow session", () => {
    assert.equal(validateWorkflowSession(null), false);
    assert.equal(validateWorkflowSession({}), false);
    assert.equal(validateWorkflowSession([]), false);
  });

  test("rejects an invalid proposal fingerprint", () => {
    const session = createWorkflowSession(
      sampleProposal,
      "not-a-valid-fingerprint"
    );

    assert.equal(validateWorkflowSession(session), false);
  });
});
