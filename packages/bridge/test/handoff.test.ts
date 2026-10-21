import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initProject } from "@aic/core";
import { generateAgentHandoff, renderAgentPrompt, computeHandoffFingerprint } from "../dist/index.js";

describe("Bridge Task Handoff & Prompt Generation", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-handoff-test-"));
    initProject(tmpDir, { name: "Handoff Test Project", objective: "Testing M12.2 Handoffs" });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("generates schema-valid handoff and preserves provenance", () => {
    const task = {
      taskId: "task-001",
      title: "Fix Bug",
      objective: "Resolve null pointer exception in parser.",
      constraints: ["No external libraries"],
      relevantFiles: ["src/parser.ts"]
    };

    const handoff = generateAgentHandoff(tmpDir, task);

    assert.equal(handoff.schemaVersion, "1.0");
    assert.equal(handoff.task.taskId, "task-001");
    assert.equal(handoff.provenance.compilerVersion, "0.1.0");
    assert.ok(handoff.fingerprint);
  });

  test("produces identical fingerprints for equivalent canonical inputs", () => {
    const task = {
      taskId: "task-002",
      title: "Refactor",
      objective: "Improve modularity.",
      constraints: ["Keep backward compatibility"],
      relevantFiles: ["src/index.ts"]
    };

    const handoff1 = generateAgentHandoff(tmpDir, task);
    const handoff2 = generateAgentHandoff(tmpDir, task);

    const base1 = { ...handoff1 };
    const base2 = { ...handoff2 };
    delete (base1 as any).fingerprint;
    delete (base1 as any).handoffId;
    delete (base1 as any).provenance.compiledAt;

    delete (base2 as any).fingerprint;
    delete (base2 as any).handoffId;
    delete (base2 as any).provenance.compiledAt;

    assert.equal(computeHandoffFingerprint(base1), computeHandoffFingerprint(base2));
  });

  test("rejects malformed task input", () => {
    assert.throws(() => {
      generateAgentHandoff(tmpDir, {} as any);
    }, /Invalid task input/);
  });

  test("renders prompt correctly with constraints and fingerprint", () => {
    const task = {
      taskId: "task-003",
      title: "Feature",
      objective: "Add logging.",
      constraints: ["Use structured logs"],
      relevantFiles: ["src/logger.ts"]
    };

    const handoff = generateAgentHandoff(tmpDir, task);
    const prompt = renderAgentPrompt(handoff);

    assert.ok(prompt.includes("Add logging."));
    assert.ok(prompt.includes("Use structured logs"));
    assert.ok(prompt.includes(handoff.fingerprint));
  });
});