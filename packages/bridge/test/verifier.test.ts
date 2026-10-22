import { test, describe } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { ExecutionResult, VerificationCheck } from "../dist/index.js";
import { verifyOutcome } from "../dist/index.js";

describe("M13.3 Outcome Verification", () => {
  const tmpDir = os.tmpdir();

  const successResult: ExecutionResult = {
    proposalId: "prop-verify-1",
    approvalId: "appr-verify-1",
    exitCode: 0,
    stdout: "All tests passed",
    stderr: "",
    startedAt: new Date(Date.now() - 1000).toISOString(),
    finishedAt: new Date().toISOString(),
    changedFiles: ["src/index.ts"],
    diffSummary: "1 file changed",
    verificationStatus: "PASSED"
  };

  test("verifies successful execution with matching exit code", () => {
    const outcome = verifyOutcome(successResult, tmpDir);
    assert.equal(outcome.status, "passed");
    assert.equal(outcome.exitCode, 0);
    assert.equal(outcome.timedOut, false);
    assert.equal(outcome.errors.length, 0);
    assert.equal(outcome.changedPaths.length, 1);
  });

  test("flags failure when exit code does not match expected", () => {
    const failedResult: ExecutionResult = {
      ...successResult,
      exitCode: 1,
      verificationStatus: "FAILED"
    };

    const outcome = verifyOutcome(failedResult, tmpDir, { expectedExitCode: 0 });
    assert.equal(outcome.status, "failed");
    assert.ok(outcome.errors.length > 0);
  });

  test("verifies required files existence successfully", () => {
    const testFile = path.join(tmpDir, `test-artifact-${Date.now()}.txt`);
    fs.writeFileSync(testFile, "hello");

    try {
      const relativeName = path.basename(testFile);
      const outcome = verifyOutcome(successResult, tmpDir, {
        requiredFiles: [relativeName]
      });

      assert.equal(outcome.status, "passed");
      const fileCheck = outcome.checks.find((c: VerificationCheck) => c.name.includes(relativeName));
      assert.equal(fileCheck?.passed, true);
    } finally {
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    }
  });

  test("flags inconclusive result when process times out", () => {
    const timeoutResult: ExecutionResult = {
      ...successResult,
      exitCode: null,
      stderr: "Execution timed out after 3000ms"
    };

    const outcome = verifyOutcome(timeoutResult, tmpDir);
    assert.equal(outcome.status, "inconclusive");
    assert.equal(outcome.timedOut, true);
  });
});