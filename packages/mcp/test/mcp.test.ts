import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initProject } from "@aic/core";
import {
  getProjectSummaryTool,
  getCurrentTaskTool,
  listDecisionsTool,
  getConstraintsTool,
  validateProjectRoot,
  createAicMcpServer
} from "../dist/index.js";

describe("AIC MCP Adapter", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-mcp-test-"));
    initProject(tmpDir, { name: "MCP Test App", objective: "Testing MCP Read-Only Tools" });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("validateProjectRoot accepts valid initialized root", () => {
    const resolved = validateProjectRoot(tmpDir);
    assert.equal(resolved, path.resolve(tmpDir));
  });

  test("validateProjectRoot rejects uninitialized or non-existent paths", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-empty-"));
    assert.throws(() => validateProjectRoot(emptyDir), /AIC is not initialized/);
    fs.rmSync(emptyDir, { recursive: true, force: true });

    assert.throws(() => validateProjectRoot(path.join(tmpDir, "non-existent")), /does not exist/);
  });

  test("getProjectSummaryTool returns correct project metadata", () => {
    const summary = getProjectSummaryTool(tmpDir);
    assert.equal(summary.project.name, "MCP Test App");
    assert.equal(summary.project.objective, "Testing MCP Read-Only Tools");
  });

  test("read-only tools return expected structure", () => {
    const task = getCurrentTaskTool(tmpDir);
    assert.equal(task.currentTask, null);

    const decisions = listDecisionsTool(tmpDir);
    assert.deepEqual(decisions.decisions, []);

    const constraints = getConstraintsTool(tmpDir);
    assert.deepEqual(constraints.constraints, []);
  });

  test("createAicMcpServer initializes successfully with project root", () => {
    const server = createAicMcpServer(tmpDir);
    assert.ok(server, "MCP server instance should be successfully created");
  });
});