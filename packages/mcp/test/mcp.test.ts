import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initProject } from "@aic/core";
import {
  getProjectSummaryTool,
  submitProposalTool,
  createAicMcpServer
} from "../dist/index.js";

describe("AIC MCP Adapter & Proposal Submission Tests", () => {
  const tmpDir = os.tmpdir();
  const projectRoot = fs.mkdtempSync(path.join(tmpDir, "aic-mcp-test-"));

  initProject(projectRoot, {
    name: "Test Project",
    objective: "Test MCP tools securely"
  });

  test("validateProjectRoot accepts valid initialized root", () => {
    const summary = getProjectSummaryTool(projectRoot);
    assert.equal(summary.project.name, "Test Project");
  });

  test("submitProposalTool successfully queues valid proposal without execution", () => {
    const result = submitProposalTool(
      {
        taskId: "task-1",
        executable: "node",
        arguments: ["-v"]
      },
      projectRoot
    );

    assert.equal(result.success, true);
    assert.equal(result.status, "AWAITING_APPROVAL");
    assert.ok(result.proposalId?.startsWith("prop-"));
    assert.ok(result.proposalFingerprint);
    assert.equal(typeof result.proposalFingerprint, "string");
  });

  test("submitProposalTool rejects proposal with missing executable or arguments", () => {
    const result = submitProposalTool(
      {
        taskId: "task-1",
        executable: "",
        arguments: []
      },
      projectRoot
    );

    assert.equal(result.success, false);
    assert.ok(result.error?.includes("executable and arguments are required"));
  });

  test("submitProposalTool rejects uninitialized or invalid project root", () => {
    const invalidRoot = fs.mkdtempSync(path.join(tmpDir, "aic-invalid-"));

    assert.throws(() => {
      submitProposalTool(
        {
          taskId: "task-1",
          executable: "node",
          arguments: ["-v"]
        },
        invalidRoot
      );
    }, /not initialized/i);
  });

  test("createAicMcpServer instantiates successfully", () => {
    const server = createAicMcpServer(projectRoot);
    assert.ok(server);
  });
});