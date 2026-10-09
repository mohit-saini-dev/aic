import test from "node:test";
import assert from "node:assert/strict";

import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";

import os from "node:os";
import path from "node:path";

import {
  initProject,
  readState,
  importContextPackage,
  exportContextPackage,
  inspectContextPackage
} from "../dist/index.js";

function makeTempDirectory() {
  return mkdtempSync(
    path.join(os.tmpdir(), "aic-roundtrip-")
  );
}

test("preserves meaningful project context across export and import", () => {
  const source = makeTempDirectory();
  const destination = makeTempDirectory();

  try {
    initProject(source, {
      name: "Offline Map Project",
      objective: "Build reliable offline map functionality"
    });

    // Populate the source with representative project context.
    const statePath = path.join(source, ".aic", "state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));

    state.currentTask = {
      id: "task-001",
      title: "Implement offline map cache",
      status: "in_progress"
    };

    state.decisions = [
      {
        id: "decision-001",
        title: "Use local map tiles",
        decision: "Cache selected tiles locally",
        reason: "Map access should work without connectivity"
      }
    ];

    state.issues = [
      {
        id: "issue-001",
        title: "Cache invalidation",
        description: "Determine when outdated tiles should be removed",
        status: "open"
      }
    ];

    state.relevantFiles = [
      "src/map/cache.ts",
      "src/map/offline.ts"
    ];

    state.constraints = [
      "Must work without an internet connection"
    ];

    state.failedAttempts = [
      "Attempted to load uncached tiles while offline"
    ];

    writeFileSync(
      statePath,
      JSON.stringify(state, null, 2) + "\n",
      "utf8"
    );

    const outputFile = path.join(source, "roundtrip.aic.json");

    exportContextPackage(source, outputFile);

    const inspected = inspectContextPackage(outputFile);

    assert.equal(
      inspected.context.project.name,
      "Offline Map Project"
    );

    importContextPackage(outputFile, destination);

    const restored = readState(destination);

    // Compare all context fields that the package promises to preserve.
    assert.deepEqual(restored.project, state.project);
    assert.deepEqual(restored.currentTask, state.currentTask);
    assert.deepEqual(restored.decisions, state.decisions);
    assert.deepEqual(restored.issues, state.issues);
    assert.deepEqual(restored.relevantFiles, state.relevantFiles);
    assert.deepEqual(restored.constraints, state.constraints);
    assert.deepEqual(restored.failedAttempts, state.failedAttempts);

    // Imported state has fresh local timestamps.
    assert.ok(Number.isNaN(Date.parse(restored.createdAt)) === false);
    assert.ok(Number.isNaN(Date.parse(restored.updatedAt)) === false);

    // The protocol version is preserved.
    assert.equal(restored.version, state.version);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(destination, { recursive: true, force: true });
  }
});
