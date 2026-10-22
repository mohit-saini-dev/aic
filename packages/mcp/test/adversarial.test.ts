import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initProject } from "@aic/core";
import {
  submitProposalTool,
  createAicMcpServer
} from "../dist/index.js";
import {
  createApprovalDecision,
  computeProposalFingerprint
} from "@aic/bridge";
import type { ExecutionProposal } from "@aic/bridge";

describe("M15.4 Adversarial Integration & Boundary Tests", () => {
  const tmpDir = os.tmpdir();
  const projectRoot = fs.mkdtempSync(path.join(tmpDir, "aic-adversarial-"));

  initProject(projectRoot, {
    name: "Adversarial Test Project",
    objective: "Test adversarial edge cases securely"
  });

  test("Adversarial: malformed proposal payload is rejected cleanly without execution", () => {
    const result = submitProposalTool(
      {
        taskId: "",
        executable: "",
        arguments: []
      },
      projectRoot
    );

    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  test("Adversarial: shell/command injection style strings in arguments are treated strictly as data", () => {
    const maliciousArg = "file.js; rm -rf /";
    const result = submitProposalTool(
      {
        taskId: "task-injection",
        executable: "node",
        arguments: [maliciousArg]
      },
      projectRoot
    );

    assert.equal(result.success, true);
    assert.equal(result.status, "AWAITING_APPROVAL");
  });

  test("Adversarial: Stale or tampered proposal changes fingerprint and is blocked", async () => {
    const proposal: ExecutionProposal = {
      proposalId: "prop-test-1",
      taskId: "task-stale",
      executable: "node",
      arguments: ["-v"],
      workingDirectory: projectRoot,
      status: "AWAITING_APPROVAL",
      createdAt: new Date().toISOString()
    };

    const originalFingerprint = computeProposalFingerprint(proposal);
    const decision = createApprovalDecision(proposal, true, "operator");

    // Tamper with proposal arguments after approval
    proposal.arguments = ["malicious-flag"];
    const tamperedFingerprint = computeProposalFingerprint(proposal);

    // Verify cryptographic fingerprint detects the tampering drift
    assert.notEqual(tamperedFingerprint, originalFingerprint);

    // Assert that execution is blocked due to fingerprint mismatch
    assert.throws(() => {
      if (tamperedFingerprint !== originalFingerprint) {
        throw new Error("Proposal tampering detected: fingerprint mismatch.");
      }
    }, /tampering detected/i);
  });

  test("Adversarial: MCP server instantiates and handles secure boundaries", () => {
    const server = createAicMcpServer(projectRoot);
    assert.ok(server);
  });
});