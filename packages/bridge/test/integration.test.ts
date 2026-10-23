import { test, describe } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  computeProposalFingerprint,
  createApprovalDecision,
  validateApprovalBinding,
  executeProposal,
  validateWorkingDirectory,
  createWorkflowSession,
  transitionWorkflow,
  verifyOutcome,
  createAuditEvent,
  persistAuditEvent
} from "../dist/index.js";
import type { ExecutionProposal } from "../dist/index.js";

describe("M14 End-to-End Integration & Threat Validation", () => {
  const tmpDir = os.tmpdir();
  const projectRoot = fs.mkdtempSync(path.join(tmpDir, "aic-integration-"));
  const auditLogPath = path.join(projectRoot, ".aic", "audit.json");

  const taskInput = {
    taskId: "task-integration-001",
    objective: "Perform secure build verification",
    constraints: ["No shell execution", "Bounded output"]
  };

  test("full end-to-end successful workflow chain", async () => {
    // 1. Create proposal & compute fingerprint
    const proposal: ExecutionProposal = {
      proposalId: "prop-e2e-1",
      taskId: taskInput.taskId,
      executable: "node",
      arguments: ["-e", "console.log('e2e-success')"],
      workingDirectory: projectRoot,
      status: "APPROVED",
      createdAt: new Date().toISOString()
    };

    const proposalFp = computeProposalFingerprint(proposal);

    // 2. Create Workflow Session & Transition
    let session = createWorkflowSession(proposal, proposalFp);
    assert.equal(session.currentState, "PENDING_PROPOSAL");

    let tr = transitionWorkflow(session, "PROPOSED");
    assert.equal(tr.success, true);
    session = tr.session;

    const decision = createApprovalDecision(proposal, true, "operator");
    const bindingVal = validateApprovalBinding(proposal, decision, projectRoot);
    assert.equal(bindingVal.valid, true);

    tr = transitionWorkflow(session, "APPROVED");
    assert.equal(tr.success, true);
    session = tr.session;

    // 3. Execute Proposal
    tr = transitionWorkflow(session, "EXECUTING");
    assert.equal(tr.success, true);
    session = tr.session;

    const execResult = await executeProposal(proposal, decision, projectRoot);
    assert.equal(execResult.exitCode, 0);
    assert.ok(execResult.stdout.includes("e2e-success"));

    // 4. Verify Outcome
    tr = transitionWorkflow(session, "VERIFYING");
    assert.equal(tr.success, true);
    session = tr.session;

    const verification = verifyOutcome(execResult, projectRoot, { expectedExitCode: 0 });
    assert.equal(verification.status, "passed");

    tr = transitionWorkflow(session, "COMPLETED_SUCCESS");
    assert.equal(tr.success, true);
    session = tr.session;

    // 5. Audit Logging
    const auditEvent = createAuditEvent(session, proposal, "WORKFLOW_FINALIZED", "system", {
      status: "COMPLETED_SUCCESS",
      verificationStatus: verification.status
    });
    const auditRes = persistAuditEvent(auditLogPath, auditEvent);
    assert.equal(auditRes.success, true);
    assert.equal(fs.existsSync(auditLogPath), true);
  });

  test("adversarial threat: proposal tampering after approval blocks execution", async () => {
    const proposal: ExecutionProposal = {
      proposalId: "prop-tamper-1",
      taskId: "task-02",
      executable: "node",
      arguments: ["-e", "console.log('safe')"],
      workingDirectory: projectRoot,
      status: "APPROVED",
      createdAt: new Date().toISOString()
    };

    const decision = createApprovalDecision(proposal, true, "operator");

    // Tamper proposalId post-approval to break binding
    const tamperedProposal: ExecutionProposal = {
      ...proposal,
      proposalId: "prop-tampered-malicious"
    };

    const execResult = await executeProposal(tamperedProposal, decision, projectRoot);
    assert.equal(execResult.exitCode, null);
    assert.equal(execResult.verificationStatus, "FAILED");
    assert.ok(execResult.stderr.includes("Execution blocked"));
  });

  test("adversarial threat: working directory traversal is blocked", async () => {
    const dirCheck = validateWorkingDirectory(projectRoot, "../../");
    assert.equal(dirCheck.valid, false);
    assert.ok(dirCheck.reason?.includes("escapes project root boundary"));
  });

  test("failure handling: audit failure reporting without silent masking", () => {
    // Create a blocker file so directory creation fails
    const blockerFile = path.join(projectRoot, `blocker-${Date.now()}`);
    fs.writeFileSync(blockerFile, "I am a file, not a directory");
    const invalidAuditPath = path.join(blockerFile, "audit.json");

    const proposal: ExecutionProposal = {
      proposalId: "prop-audit-fail",
      taskId: "task-04",
      executable: "node",
      arguments: ["-v"],
      workingDirectory: projectRoot,
      status: "APPROVED",
      createdAt: new Date().toISOString()
    };
    const session = createWorkflowSession(proposal, "fp");
    const event = createAuditEvent(session, proposal, "WORKFLOW_FINALIZED", "system", {});

    const res = persistAuditEvent(invalidAuditPath, event);
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("Audit persistence failed"));
  });
});