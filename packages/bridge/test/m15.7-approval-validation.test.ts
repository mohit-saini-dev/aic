
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  saveProposal,
  updateProposalApproval,
  listStoredProposals
} from "../dist/index.js";

function createTestProject(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "aic-m15-7-")
  );

  const aicDir = path.join(root, ".aic");
  fs.mkdirSync(aicDir);

  fs.writeFileSync(
    path.join(aicDir, "state.json"),
    JSON.stringify({ version: "test" }),
    "utf8"
  );

  return root;
}

function createPendingProposal(root: string) {
  return saveProposal(root, {
    taskId: "task-approval-validation",
    executable: "node",
    arguments: ["-e", "console.log('safe')"]
  });
}

function readStoredApproval(
  root: string,
  proposalId: string
): Record<string, unknown> {
  const storePath = path.join(
    root,
    ".aic",
    "proposals.json"
  );

  const store = JSON.parse(
    fs.readFileSync(storePath, "utf8")
  ) as {
    proposals: Array<{
      proposal: { proposalId: string };
      approval?: Record<string, unknown>;
    }>;
  };

  const record = store.proposals.find(
    (item) => item.proposal.proposalId === proposalId
  );

  assert.ok(record, "Expected saved proposal in durable store");
  assert.ok(record.approval, "Expected persisted approval");

  return record.approval;
}

describe("M15.7 proposal approval validation", () => {
  test("accepts a valid approval decision", () => {
    const root = createTestProject();

    try {
      const proposal = createPendingProposal(root);

      const approved = updateProposalApproval(
        root,
        proposal.proposalId,
        true,
        "test-operator",
        "Valid approval"
      );

      assert.equal(approved.status, "APPROVED");
      assert.equal(approved.approval?.approved, true);
      assert.equal(
        approved.approval?.approvalFingerprint,
        proposal.fingerprint
      );

      assert.equal(listStoredProposals(root).length, 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects an empty approver identity without changing the proposal", () => {
    const root = createTestProject();

    try {
      const proposal = createPendingProposal(root);

      assert.throws(
        () =>
          updateProposalApproval(
            root,
            proposal.proposalId,
            true,
            "   ",
            "Invalid approver"
          ),
        /invalid approval decision/i
      );

      const stored = listStoredProposals(root);

      assert.equal(stored.length, 1);
      assert.equal(stored[0].status, proposal.status);
      assert.equal(stored[0].workflowState, "PROPOSED");
      assert.equal(stored[0].approval, undefined);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects an externally supplied approval with a mismatched proposal ID", () => {
    const root = createTestProject();

    try {
      const proposal = createPendingProposal(root);

      const malformedApproval = {
        approvalId: "approval-test",
        proposalId: "different-proposal",
        approved: true,
        decidedBy: "test-operator",
        decidedAt: new Date().toISOString(),
        approvalFingerprint: proposal.fingerprint
      };

      assert.throws(
        () =>
          updateProposalApproval(
            root,
            proposal.proposalId,
            malformedApproval
          ),
        /invalid approval decision/i
      );

      assert.equal(
        listStoredProposals(root)[0].status,
        proposal.status
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects an externally supplied approval with an invalid timestamp", () => {
    const root = createTestProject();

    try {
      const proposal = createPendingProposal(root);

      const malformedApproval = {
        approvalId: "approval-test",
        proposalId: proposal.proposalId,
        approved: true,
        decidedBy: "test-operator",
        decidedAt: "not-a-date",
        approvalFingerprint: proposal.fingerprint
      };

      assert.throws(
        () =>
          updateProposalApproval(
            root,
            proposal.proposalId,
            malformedApproval
          ),
        /invalid approval decision/i
      );

      assert.equal(
        listStoredProposals(root)[0].status,
        proposal.status
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects an externally supplied approval with a malformed fingerprint", () => {
    const root = createTestProject();

    try {
      const proposal = createPendingProposal(root);

      const malformedApproval = {
        approvalId: "approval-test",
        proposalId: proposal.proposalId,
        approved: true,
        decidedBy: "test-operator",
        decidedAt: new Date().toISOString(),
        approvalFingerprint: "not-a-fingerprint"
      };

      assert.throws(
        () =>
          updateProposalApproval(
            root,
            proposal.proposalId,
            malformedApproval
          ),
        /invalid approval decision/i
      );

      assert.equal(
        listStoredProposals(root)[0].status,
        proposal.status
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects an approval with a non-boolean decision", () => {
    const root = createTestProject();

    try {
      const proposal = createPendingProposal(root);

      const malformedApproval = {
        approvalId: "approval-test",
        proposalId: proposal.proposalId,
        approved: "yes",
        decidedBy: "test-operator",
        decidedAt: new Date().toISOString(),
        approvalFingerprint: proposal.fingerprint
      };

      assert.throws(
        () =>
          updateProposalApproval(
            root,
            proposal.proposalId,
            malformedApproval as never
          ),
        /invalid approval decision/i
      );

      assert.equal(
        listStoredProposals(root)[0].status,
        proposal.status
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects persisted approvals with an empty approver identity", () => {
    const root = createTestProject();

    try {
      const proposal = createPendingProposal(root);

      updateProposalApproval(
        root,
        proposal.proposalId,
        true,
        "test-operator"
      );

      const storePath = path.join(
        root,
        ".aic",
        "proposals.json"
      );

      const store = JSON.parse(
        fs.readFileSync(storePath, "utf8")
      );

      const record = store.proposals.find(
        (item: { proposal: { proposalId: string } }) =>
          item.proposal.proposalId === proposal.proposalId
      );

      assert.ok(record?.approval);

      record.approval.decidedBy = "   ";

      fs.writeFileSync(
        storePath,
        JSON.stringify(store, null, 2),
        "utf8"
      );

      assert.throws(
        () => listStoredProposals(root),
        /invalid or tampered record/i
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("preserves an existing lock and blocks proposal creation", () => {
    const root = createTestProject();
    const lockPath = path.join(
      root,
      ".aic",
      "proposals.json.lock"
    );
    const lockContents = JSON.stringify({
      pid: 12345,
      createdAt: new Date().toISOString()
    });

    try {
      fs.writeFileSync(lockPath, lockContents, {
        encoding: "utf8",
        flag: "wx"
      });

      assert.throws(
        () => createPendingProposal(root),
        /proposal store is locked by another operation/i
      );

      assert.equal(
        fs.readFileSync(lockPath, "utf8"),
        lockContents,
        "The existing lock must remain untouched"
      );

      assert.equal(
        fs.existsSync(path.join(root, ".aic", "proposals.json")),
        false,
        "A blocked operation must not create the proposal store"
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("releases the lock after proposal validation fails", () => {
    const root = createTestProject();
    const lockPath = path.join(
      root,
      ".aic",
      "proposals.json.lock"
    );

    try {
      assert.throws(
        () =>
          saveProposal(root, {
            taskId: "task-invalid-input",
            executable: "node",
            arguments: [],
            status: "EXECUTED" as never
          }),
        /invalid proposal input|new proposals must begin/i
      );

      assert.equal(
        fs.existsSync(lockPath),
        false,
        "The lock must be released after a failed operation"
      );

      const proposal = createPendingProposal(root);
      assert.equal(proposal.status, "AWAITING_APPROVAL");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
