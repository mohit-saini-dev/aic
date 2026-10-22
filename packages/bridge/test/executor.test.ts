import { test, describe } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import type { 
  ExecutionProposal, 
  ApprovalDecision 
} from "../dist/index.js";
import { executeProposal } from "../dist/index.js";

describe("Bridge Bounded Executor & Security Hardening", () => {
  const projectRoot = os.tmpdir();

  const validProposal: ExecutionProposal = {
    proposalId: "prop-exec-101",
    taskId: "task-001",
    executable: "node",
    arguments: ["-e", "console.log('hello-aic')"],
    workingDirectory: projectRoot,
    status: "APPROVED",
    createdAt: new Date().toISOString()
  };

  const validDecision: ApprovalDecision = {
    approvalId: "appr-exec-202",
    proposalId: "prop-exec-101",
    approved: true,
    decidedBy: "operator",
    decidedAt: new Date().toISOString()
  };

  test("executes approved proposal successfully and captures stdout", async () => {
    const result = await executeProposal(validProposal, validDecision, projectRoot);
    
    assert.equal(result.proposalId, validProposal.proposalId);
    assert.equal(result.approvalId, validDecision.approvalId);
    assert.equal(result.exitCode, 0);
    assert.equal(result.verificationStatus, "PASSED");
    assert.ok(result.stdout.includes("hello-aic"));
  });

  test("blocks execution if approval re-validation fails", async () => {
    const unauthorizedProposal: ExecutionProposal = {
      ...validProposal,
      executable: "rm"
    };

    const result = await executeProposal(unauthorizedProposal, validDecision, projectRoot);
    
    assert.equal(result.exitCode, null);
    assert.equal(result.verificationStatus, "FAILED");
    assert.ok(result.stderr.includes("Execution blocked"));
  });

  test("blocks working directory traversal attempts outside project root", async () => {
    const traversalProposal: ExecutionProposal = {
      ...validProposal,
      workingDirectory: "../"
    };

    const result = await executeProposal(traversalProposal, validDecision, projectRoot);
    
    assert.equal(result.exitCode, null);
    assert.equal(result.verificationStatus, "FAILED");
    assert.ok(result.stderr.includes("escapes project root boundary"));
  });

  test("handles process timeout correctly", async () => {
    const slowProposal: ExecutionProposal = {
      ...validProposal,
      arguments: ["-e", "setTimeout(() => {}, 5000)"]
    };

    const result = await executeProposal(slowProposal, validDecision, projectRoot, undefined, {
      timeoutMs: 300
    });

    assert.equal(result.verificationStatus, "FAILED");
    assert.ok(result.stderr.includes("timed out"));
  });
});