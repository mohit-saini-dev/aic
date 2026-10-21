import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { ExecutionProposal } from "../dist/index.js";
import { validateProposalIntegrity, createApprovalDecision } from "../dist/index.js";

describe("Bridge Approval State Machine", () => {
  const sampleProposal: ExecutionProposal = {
    proposalId: "prop-123",
    taskId: "task-01",
    executable: "git",
    arguments: ["status", "--short"],
    workingDirectory: "/mock/root",
    status: "AWAITING_APPROVAL",
    createdAt: new Date().toISOString()
  };

  test("approves valid proposal matching integrity rules", () => {
    const decision = createApprovalDecision(sampleProposal, true, "developer");
    const isValid = validateProposalIntegrity(sampleProposal, decision);
    assert.equal(isValid, true);
  });

  test("rejects approval if proposalId mismatches", () => {
    const decision = createApprovalDecision(sampleProposal, true, "developer");
    decision.proposalId = "prop-999"; // Tampered ID
    const isValid = validateProposalIntegrity(sampleProposal, decision);
    assert.equal(isValid, false);
  });

  test("rejects approval if decision is marked false", () => {
    const decision = createApprovalDecision(sampleProposal, false, "developer");
    const isValid = validateProposalIntegrity(sampleProposal, decision);
    assert.equal(isValid, false);
  });
});