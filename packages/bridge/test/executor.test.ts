import { test, describe } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import type {
  ExecutionProposal,
  ApprovalDecision
} from "../dist/index.js";

import {
  executeProposal,
  validateWorkingDirectory,
  computeProposalFingerprint
} from "../dist/index.js";

async function waitForProcessExit(
  pid: number,
  timeoutMs = 2500
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
}

async function waitForFile(
  filePath: string,
  timeoutMs = 2000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return fs.existsSync(filePath);
}

function terminateTestProcess(pid: number): void {
  try {
    if (process.platform === "win32") {
      spawnSync(
        "taskkill",
        ["/PID", String(pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" }
      );
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch {
    // The process may already have exited.
  }
}

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
    decidedAt: new Date().toISOString(),
    approvalFingerprint: computeProposalFingerprint(validProposal)
  };

  test("executes approved proposal successfully and captures stdout", async () => {
    const result = await executeProposal(
      validProposal,
      validDecision,
      projectRoot
    );

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

    const result = await executeProposal(
      unauthorizedProposal,
      validDecision,
      projectRoot
    );

    assert.equal(result.exitCode, null);
    assert.equal(result.verificationStatus, "FAILED");
    assert.ok(result.stderr.includes("Execution blocked"));
  });

  test("blocks execution when proposal status is not APPROVED", async () => {
    const proposedProposal: ExecutionProposal = {
      ...validProposal,
      status: "PROPOSED"
    };

    // Status is lifecycle metadata and is excluded from the fingerprint.
    const result = await executeProposal(
      proposedProposal,
      validDecision,
      projectRoot
    );

    assert.equal(result.exitCode, null);
    assert.equal(result.verificationStatus, "FAILED");
    assert.ok(result.stderr.includes("status is not APPROVED"));
  });

  test("blocks execution when approval ID is empty", async () => {
    const invalidDecision: ApprovalDecision = {
      ...validDecision,
      approvalId: "   "
    };

    const result = await executeProposal(
      validProposal,
      invalidDecision,
      projectRoot
    );

    assert.equal(result.exitCode, null);
    assert.equal(result.verificationStatus, "FAILED");
    assert.ok(result.stderr.includes("Approval ID"));
  });

  test("blocks execution when approver identity is blank", async () => {
    const invalidDecision: ApprovalDecision = {
      ...validDecision,
      decidedBy: "   "
    };

    const result = await executeProposal(
      validProposal,
      invalidDecision,
      projectRoot
    );

    assert.equal(result.exitCode, null);
    assert.equal(result.verificationStatus, "FAILED");
    assert.ok(result.stderr.includes("Approver identity"));
  });

  test("blocks execution when approval timestamp is invalid", async () => {
    const invalidDecision: ApprovalDecision = {
      ...validDecision,
      decidedAt: "not-a-date"
    };

    const result = await executeProposal(
      validProposal,
      invalidDecision,
      projectRoot
    );

    assert.equal(result.exitCode, null);
    assert.equal(result.verificationStatus, "FAILED");
    assert.ok(result.stderr.includes("Approval timestamp"));
  });

  test("blocks execution when approval decision is not boolean true", async () => {
    const invalidDecision = {
      ...validDecision,
      approved: "yes"
    } as unknown as ApprovalDecision;

    const result = await executeProposal(
      validProposal,
      invalidDecision,
      projectRoot
    );

    assert.equal(result.exitCode, null);
    assert.equal(result.verificationStatus, "FAILED");
    assert.ok(result.stderr.includes("not been approved"));
  });

  test("blocks working directory traversal attempts outside project root", () => {
    const dirCheck = validateWorkingDirectory(projectRoot, "../");

    assert.equal(dirCheck.valid, false);
    assert.ok(
      dirCheck.reason?.includes("escapes project root boundary")
    );
  });

  test("blocks a symlinked working directory that escapes the project root", (t) => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "aic-executor-symlink-")
    );
    const outside = fs.mkdtempSync(
      path.join(os.tmpdir(), "aic-executor-outside-")
    );

    t.after(() => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    });

    const link = path.join(root, "external");

    try {
      fs.symlinkSync(outside, link, "junction");
    } catch (error) {
      t.skip(`Symlink creation unavailable: ${String(error)}`);
      return;
    }

    const result = validateWorkingDirectory(root, link);

    assert.equal(result.valid, false);
    assert.match(
      result.reason ?? "",
      /escapes project root boundary/i
    );
  });

  test("handles process timeout correctly", async () => {
    const slowProposal: ExecutionProposal = {
      ...validProposal,
      arguments: ["-e", "setTimeout(() => {}, 5000)"]
    };

    const slowDecision: ApprovalDecision = {
      ...validDecision,
      approvalFingerprint: computeProposalFingerprint(slowProposal)
    };

    const result = await executeProposal(
      slowProposal,
      slowDecision,
      projectRoot,
      undefined,
      { timeoutMs: 300 }
    );

    assert.equal(result.verificationStatus, "FAILED");
    assert.ok(result.stderr.includes("timed out"));
  });

  test("terminates the descendant process when execution times out", async (t) => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "aic-executor-tree-")
    );
    const scriptPath = path.join(root, "spawn-descendant.cjs");
    const pidFile = path.join(root, "descendant.pid");

    let descendantPid: number | undefined;

    // The script is stored in a file so the proposal arguments remain simple.
    // The descendant ignores stdio so inherited pipe handles cannot keep the
    // executor waiting for output streams to close.
    fs.writeFileSync(
      scriptPath,
      [
        'const { spawn } = require("node:child_process");',
        'const fs = require("node:fs");',
        'const pidFile = process.argv[2];',
        'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
        'fs.writeFileSync(pidFile, String(child.pid));',
        'setInterval(() => {}, 1000);',
        ""
      ].join("\n"),
      "utf8"
    );

    t.after(async () => {
      if (descendantPid !== undefined) {
        terminateTestProcess(descendantPid);
        await waitForProcessExit(descendantPid, 1000);
      }

      fs.rmSync(root, { recursive: true, force: true });
    });

    const treeProposal: ExecutionProposal = {
      ...validProposal,
      proposalId: "prop-exec-tree-303",
      workingDirectory: root,
      arguments: [scriptPath, pidFile]
    };

    const treeDecision: ApprovalDecision = {
      ...validDecision,
      proposalId: treeProposal.proposalId,
      approvalFingerprint: computeProposalFingerprint(treeProposal)
    };

    const result = await executeProposal(
      treeProposal,
      treeDecision,
      root,
      undefined,
      { timeoutMs: 3000 }
    );

    assert.equal(result.verificationStatus, "FAILED");
    assert.ok(
      result.stderr.includes("timed out"),
      `Expected timeout diagnostic; received: ${result.stderr}`
    );

    assert.ok(
      await waitForFile(pidFile),
      "The parent process should have started the descendant and written its PID"
    );

    descendantPid = Number(fs.readFileSync(pidFile, "utf8").trim());

    assert.ok(
      Number.isSafeInteger(descendantPid) && descendantPid > 0,
      "The descendant PID file should contain a valid process ID"
    );

    const descendantStopped = await waitForProcessExit(descendantPid);

    assert.equal(
      descendantStopped,
      true,
      `Descendant process ${descendantPid} was still running after the executor timed out`
    );
  });

  test("terminates execution when output exceeds the configured limit", async () => {
    const noisyProposal: ExecutionProposal = {
      ...validProposal,
      arguments: [
        "-e",
        "process.stdout.write('x'.repeat(2_000_000))"
      ]
    };

    const noisyDecision: ApprovalDecision = {
      ...validDecision,
      approvalFingerprint: computeProposalFingerprint(noisyProposal)
    };

    const result = await executeProposal(
      noisyProposal,
      noisyDecision,
      projectRoot,
      undefined,
      { maxOutputBytes: 1024, timeoutMs: 5000 }
    );

    assert.equal(result.verificationStatus, "FAILED");
    assert.ok(
      result.stderr.includes("Output truncated") ||
      result.stderr.includes("maximum output size"),
      `Expected output-limit diagnostic; received: ${result.stderr}`
    );

    assert.ok(
      Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) <= 1024,
      "Captured stdout and stderr should stay within the configured byte limit"
    );
  });
});