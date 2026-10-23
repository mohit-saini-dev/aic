import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  saveProposal,
  updateProposalApproval,
  listStoredProposals,
  executeProposal
} from "../dist/index.js";

function createTestProject(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "aic-m15-6-")
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

describe("M15.6 post-approval integrity regression", () => {
  test("rejects a persisted proposal whose arguments were tampered with", () => {
    const root = createTestProject();

    try {
      const saved = saveProposal(root, {
        taskId: "task-tamper-store",
        executable: "node",
        arguments: ["-e", "console.log('original')"]
      });

      updateProposalApproval(
        root,
        saved.proposalId,
        true,
        "test-operator",
        "Regression test"
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
          item.proposal.proposalId === saved.proposalId
      );

      assert.ok(record, "Expected saved proposal in durable store");

      // Change the payload without updating its fingerprint.
      record.proposal.arguments = [
        "-e",
        "console.log('tampered')"
      ];

      fs.writeFileSync(
        storePath,
        JSON.stringify(store, null, 2),
        "utf8"
      );

      assert.throws(
        () => listStoredProposals(root),
        /failed fingerprint verification/i
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("does not execute an in-memory proposal changed after approval", async () => {
    const root = createTestProject();
    const marker = path.join(root, "spawned.marker");

    try {
      const saved = saveProposal(root, {
        taskId: "task-tamper-execution",
        executable: "node",
        arguments: ["-e", "console.log('original')"]
      });

      const approved = updateProposalApproval(
        root,
        saved.proposalId,
        true,
        "test-operator",
        "Regression test"
      );

      assert.ok(approved.approval, "Expected approval decision");

      // Benign test payload: creates a marker only if execution occurs.
      const markerScript =
        "require('node:fs').writeFileSync(" +
        JSON.stringify(marker) +
        ", 'spawned')";

      // Simulate a changed proposal while reusing the old approval.
      const tamperedProposal = {
        ...approved,
        arguments: ["-e", markerScript]
      };

      const result = await executeProposal(
        tamperedProposal,
        approved.approval,
        root
      );

      // Security expectation: reject before spawning.
      assert.equal(
        result.exitCode,
        null,
        "Tampered proposal must not execute"
      );

      assert.equal(
        result.verificationStatus,
        "FAILED"
      );

      assert.equal(
        fs.existsSync(marker),
        false,
        "The process must not create the marker"
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});