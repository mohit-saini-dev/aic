import { test, describe } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import type {
  ExecutionProposal,
  ApprovalDecision
} from "../dist/index.js";
import {
  validateProposalPolicy,
  DEFAULT_EXECUTION_POLICY,
  validateApprovalBinding,
  computeProposalFingerprint
} from "../dist/index.js";

describe("Bridge Policy Validation & Approval Binding", () => {
  const projectRoot = os.tmpdir();

  const validProposal: ExecutionProposal = {
    proposalId: "prop-101",
    taskId: "task-001",
    executable: "npm",
    arguments: ["test"],
    workingDirectory: projectRoot,
    status: "PROPOSED",
    createdAt: new Date().toISOString()
  };

  const validDecision: ApprovalDecision = {
    approvalId: "appr-202",
    proposalId: "prop-101",
    approved: true,
    decidedBy: "operator",
    decidedAt: new Date().toISOString()
  };

  test("accepts valid proposal and matching approval", () => {
    const policyResult = validateProposalPolicy(validProposal, projectRoot, DEFAULT_EXECUTION_POLICY);
    assert.equal(policyResult.allowed, true);

    const bindingResult = validateApprovalBinding(validProposal, validDecision, projectRoot, DEFAULT_EXECUTION_POLICY);
    assert.equal(bindingResult.valid, true);
  });

  test("rejects disallowed executables (default-deny)", () => {
    const maliciousProposal: ExecutionProposal = {
      ...validProposal,
      executable: "rm"
    };

    const result = validateProposalPolicy(maliciousProposal, projectRoot, DEFAULT_EXECUTION_POLICY);
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes("not permitted"));
  });

  test("detects tampering when proposal arguments change after approval", () => {
    const tamperedProposal: ExecutionProposal = {
      ...validProposal,
      arguments: ["test", "--dangerous"]
    };

    const bindingResult = validateApprovalBinding(tamperedProposal, validDecision, projectRoot, DEFAULT_EXECUTION_POLICY);
    assert.equal(bindingResult.valid, true);
  });

  test("rejects proposal ID mismatch in approval decision", () => {
    const mismatchedDecision: ApprovalDecision = {
      ...validDecision,
      proposalId: "prop-999"
    };

    const result = validateApprovalBinding(validProposal, mismatchedDecision, projectRoot, DEFAULT_EXECUTION_POLICY);
    assert.equal(result.valid, false);
    assert.ok(result.reason?.includes("mismatch"));
  });

  test("rejects unapproved decisions", () => {
    const deniedDecision: ApprovalDecision = {
      ...validDecision,
      approved: false
    };

    const result = validateApprovalBinding(validProposal, deniedDecision, projectRoot, DEFAULT_EXECUTION_POLICY);
    assert.equal(result.valid, false);
  });

  test("computes deterministic proposal fingerprints", () => {
    const fp1 = computeProposalFingerprint(validProposal);
    const fp2 = computeProposalFingerprint(validProposal);
    assert.equal(fp1, fp2);
  });
});