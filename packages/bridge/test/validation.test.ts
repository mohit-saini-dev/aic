import { test, describe } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

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
    decidedAt: new Date().toISOString(),
    approvalFingerprint: computeProposalFingerprint(validProposal)
  };

  test("accepts valid proposal and matching approval", () => {
    const policyResult = validateProposalPolicy(
      validProposal,
      projectRoot,
      DEFAULT_EXECUTION_POLICY
    );

    assert.equal(policyResult.allowed, true);

    const bindingResult = validateApprovalBinding(
      validProposal,
      validDecision,
      projectRoot,
      DEFAULT_EXECUTION_POLICY
    );

    assert.equal(bindingResult.valid, true);
  });

  test("rejects disallowed executables (default-deny)", () => {
    const maliciousProposal: ExecutionProposal = {
      ...validProposal,
      executable: "rm"
    };

    const result = validateProposalPolicy(
      maliciousProposal,
      projectRoot,
      DEFAULT_EXECUTION_POLICY
    );

    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes("not permitted"));
  });

  test("rejects tampering when proposal arguments change after approval", () => {
    const tamperedProposal: ExecutionProposal = {
      ...validProposal,
      arguments: ["test", "--dangerous"]
    };

    const bindingResult = validateApprovalBinding(
      tamperedProposal,
      validDecision,
      projectRoot,
      DEFAULT_EXECUTION_POLICY
    );

    assert.equal(bindingResult.valid, false);
    assert.ok(bindingResult.reason?.includes("fingerprint mismatch"));
  });

  test("rejects approval with a missing fingerprint", () => {
    const decisionWithoutFingerprint = {
      ...validDecision,
      approvalFingerprint: undefined
    } as unknown as ApprovalDecision;

    const result = validateApprovalBinding(
      validProposal,
      decisionWithoutFingerprint,
      projectRoot
    );

    assert.equal(result.valid, false);
    assert.ok(result.reason?.includes("fingerprint"));
  });

  test("rejects approval with an empty fingerprint", () => {
    const result = validateApprovalBinding(
      validProposal,
      {
        ...validDecision,
        approvalFingerprint: ""
      },
      projectRoot
    );

    assert.equal(result.valid, false);
    assert.ok(result.reason?.includes("fingerprint"));
  });

  test("rejects approval with a malformed fingerprint", () => {
    const result = validateApprovalBinding(
      validProposal,
      {
        ...validDecision,
        approvalFingerprint: "not-a-sha256-fingerprint"
      },
      projectRoot
    );

    assert.equal(result.valid, false);
    assert.ok(result.reason?.includes("fingerprint"));
  });

  test("rejects approval with a mismatched fingerprint", () => {
    const result = validateApprovalBinding(
      validProposal,
      {
        ...validDecision,
        approvalFingerprint: "0".repeat(64)
      },
      projectRoot
    );

    assert.equal(result.valid, false);
    assert.ok(result.reason?.includes("fingerprint mismatch"));
  });

  test("rejects proposal ID mismatch in approval decision", () => {
    const mismatchedDecision: ApprovalDecision = {
      ...validDecision,
      proposalId: "prop-999"
    };

    const result = validateApprovalBinding(
      validProposal,
      mismatchedDecision,
      projectRoot,
      DEFAULT_EXECUTION_POLICY
    );

    assert.equal(result.valid, false);
    assert.ok(result.reason?.includes("mismatch"));
  });

  test("rejects unapproved decisions", () => {
    const deniedDecision: ApprovalDecision = {
      ...validDecision,
      approved: false
    };

    const result = validateApprovalBinding(
      validProposal,
      deniedDecision,
      projectRoot,
      DEFAULT_EXECUTION_POLICY
    );

    assert.equal(result.valid, false);
  });

  test("rejects proposals exceeding the configured argument limit", () => {
    const proposal = {
      ...validProposal,
      arguments: ["test", "--watch"]
    };
    const policy = {
      ...DEFAULT_EXECUTION_POLICY,
      maxArguments: 1
    };

    const result = validateProposalPolicy(proposal, projectRoot, policy);

    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes("maximum argument count"));
  });

  test("rejects arguments matching a disallowed security pattern", () => {
    const proposal = {
      ...validProposal,
      arguments: ["test", "; rm -rf /"]
    };

    const result = validateProposalPolicy(
      proposal,
      projectRoot,
      DEFAULT_EXECUTION_POLICY
    );

    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes("disallowed argument pattern"));
  });

  test("rejects a working directory outside the project root", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "aic-policy-root-")
    );
    const outside = fs.mkdtempSync(
      path.join(os.tmpdir(), "aic-policy-outside-")
    );

    try {
      const proposal = {
        ...validProposal,
        workingDirectory: outside
      };

      const result = validateProposalPolicy(
        proposal,
        root,
        DEFAULT_EXECUTION_POLICY
      );

      assert.equal(result.allowed, false);
      assert.ok(result.reason?.includes("escapes project root"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test("rejects a nonexistent working directory", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "aic-policy-root-")
    );

    try {
      const proposal = {
        ...validProposal,
        workingDirectory: path.join(root, "does-not-exist")
      };

      const result = validateProposalPolicy(
        proposal,
        root,
        DEFAULT_EXECUTION_POLICY
      );

      assert.equal(result.allowed, false);
      assert.ok(result.reason?.includes("could not be resolved"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  test("rejects a working directory symlink that escapes the project root", (t) => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "aic-policy-symlink-root-")
    );
    const outside = fs.mkdtempSync(
      path.join(os.tmpdir(), "aic-policy-symlink-outside-")
    );
    const link = path.join(root, "linked-dir");

    try {
      try {
        fs.symlinkSync(outside, link, "junction");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (
          code === "EPERM" ||
          code === "EACCES" ||
          code === "ENOSYS" ||
          code === "ENOTSUP"
        ) {
          t.skip(`Directory symlink creation is unavailable: ${code}`);
          return;
        }
        throw error;
      }

      const proposal = {
        ...validProposal,
        workingDirectory: link
      };

      const result = validateProposalPolicy(
        proposal,
        root,
        DEFAULT_EXECUTION_POLICY
      );

      assert.equal(result.allowed, false);
      assert.ok(result.reason?.includes("escapes project root"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
  test("computes deterministic proposal fingerprints", () => {
    const fp1 = computeProposalFingerprint(validProposal);
    const fp2 = computeProposalFingerprint(validProposal);

    assert.equal(fp1, fp2);
    assert.match(fp1, /^[a-f0-9]{64}$/);
  });
});