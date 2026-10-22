import { test, describe } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { ExecutionProposal } from "../dist/index.js";
import { createWorkflowSession } from "../dist/index.js";
import { createAuditEvent, persistAuditEvent } from "../dist/index.js";

describe("M13.4 Audit & Provenance Logging", () => {
  const tmpDir = os.tmpdir();
  const auditPath = path.join(tmpDir, `aic-audit-${Date.now()}.json`);

  const proposal: ExecutionProposal = {
    proposalId: "prop-audit-1",
    taskId: "task-01",
    executable: "node",
    arguments: ["-v"],
    workingDirectory: ".",
    status: "APPROVED",
    createdAt: new Date().toISOString()
  };

  const session = createWorkflowSession(proposal, "sha256-fingerprint");

  test("creates audit event and redacts sensitive keys", () => {
    const event = createAuditEvent(session, proposal, "PROPOSAL_CREATED", "agent-system", {
      detail: "initialized",
      apiKey: "secret-api-key-123",
      token: "secret-token-xyz"
    });

    assert.equal(event.sessionId, session.sessionId);
    assert.equal(event.proposalId, proposal.proposalId);
    assert.equal(event.proposalFingerprint, "sha256-fingerprint");
    assert.equal(event.payload.apiKey, "[REDACTED]");
    assert.equal(event.payload.token, "[REDACTED]");
    assert.equal(event.payload.detail, "initialized");
  });

  test("persists audit events atomically to disk", () => {
    try {
      const event = createAuditEvent(session, proposal, "WORKFLOW_FINALIZED", "operator", {
        status: "COMPLETED_SUCCESS"
      });

      const res = persistAuditEvent(auditPath, event);
      assert.equal(res.success, true);
      assert.equal(fs.existsSync(auditPath), true);

      const raw = fs.readFileSync(auditPath, "utf-8");
      const store = JSON.parse(raw);
      assert.equal(store.events.length, 1);
      assert.equal(store.events[0].eventType, "WORKFLOW_FINALIZED");
    } finally {
      if (fs.existsSync(auditPath)) {
        fs.unlinkSync(auditPath);
      }
    }
  });
});