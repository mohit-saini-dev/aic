import test from "node:test";
import assert from "node:assert/strict";

import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync
} from "node:fs";

import os from "node:os";
import path from "node:path";

import {
  initProject,
  getStatus,
  readState,
  createSnapshot
} from "../dist/index.js";

function createTempDirectory() {
  return mkdtempSync(path.join(os.tmpdir(), "aic-test-"));
}

test("initializes a project with the supplied name and objective", () => {
  const root = createTempDirectory();

  try {
    const state = initProject(root, {
      name: "Test Project",
      objective: "Test AIC initialization"
    });

    assert.equal(state.project.name, "Test Project");
    assert.equal(
      state.project.objective,
      "Test AIC initialization"
    );

    assert.equal(
      existsSync(path.join(root, ".aic", "state.json")),
      true
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports an initialized project correctly", () => {
  const root = createTempDirectory();

  try {
    initProject(root, { name: "Status Test" });

    const status = getStatus(root);

    assert.equal(status.initialized, true);
    assert.equal(status.projectName, "Status Test");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not overwrite an existing AIC state", () => {
  const root = createTempDirectory();

  try {
    initProject(root, { name: "Original Project" });

    assert.throws(
      () => initProject(root, { name: "Replacement Project" }),
      /already initialized/
    );

    const state = readState(root);

    assert.equal(state.project.name, "Original Project");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("creates a snapshot without modifying the current state", () => {
  const root = createTempDirectory();

  try {
    const original = initProject(root, {
      name: "Snapshot Test",
      objective: "Verify snapshots"
    });

    const snapshotPath = createSnapshot(root);

    assert.equal(existsSync(snapshotPath), true);

    const snapshot = JSON.parse(
      readFileSync(snapshotPath, "utf8")
    );

    assert.equal(snapshot.project.name, original.project.name);
    assert.equal(
      snapshot.project.objective,
      original.project.objective
    );

    const current = readState(root);

    assert.equal(current.project.name, "Snapshot Test");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects malformed JSON in the current state", () => {
  const root = createTempDirectory();

  try {
    const aicDirectory = path.join(root, ".aic");

    mkdirSync(aicDirectory, { recursive: true });

    writeFileSync(
      path.join(aicDirectory, "state.json"),
      "{ invalid json",
      "utf8"
    );

    assert.throws(
      () => getStatus(root),
      /unreadable or invalid JSON/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
