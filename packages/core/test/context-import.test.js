import test from "node:test";
import assert from "node:assert/strict";

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";

import os from "node:os";
import path from "node:path";

import {
  initProject,
  importContextPackage
} from "../dist/index.js";

import {
  createContextPackage
} from "../dist/context-package.js";

function makeTempDirectory() {
  return mkdtempSync(
    path.join(os.tmpdir(), "aic-import-test-")
  );
}

function createTestProject(root, name = "Import Test Project") {
  initProject(root, {
    name,
    objective: "Test safe context import"
  });
}

function writePackage(root, filename, contextPackage) {
  const filePath = path.join(root, filename);

  writeFileSync(
    filePath,
    JSON.stringify(contextPackage, null, 2) + "\n",
    "utf8"
  );

  return filePath;
}

test("imports a valid package into a destination without state", () => {
  const source = makeTempDirectory();
  const destination = makeTempDirectory();

  try {
    createTestProject(source, "Portable Project");

    const contextPackage = createContextPackage(source);
    const packagePath = writePackage(
      source,
      "handoff.aic.json",
      contextPackage
    );

    const statePath = importContextPackage(
      packagePath,
      destination
    );

    const importedState = JSON.parse(
      readFileSync(statePath, "utf8")
    );

    assert.equal(
      importedState.project.name,
      "Portable Project"
    );

    assert.equal(
      importedState.project.objective,
      "Test safe context import"
    );

    assert.deepEqual(importedState.decisions, []);
    assert.deepEqual(importedState.issues, []);
    assert.deepEqual(importedState.relevantFiles, []);
    assert.ok(Number.isNaN(Date.parse(importedState.updatedAt)) === false);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(destination, { recursive: true, force: true });
  }
});

test("rejects invalid JSON without creating project state", () => {
  const source = makeTempDirectory();
  const destination = makeTempDirectory();

  try {
    const packagePath = path.join(source, "broken.json");
    writeFileSync(packagePath, "{not valid JSON", "utf8");

    assert.throws(
      () => importContextPackage(packagePath, destination),
      /not valid JSON/
    );

    assert.equal(
      existsSync(path.join(destination, ".aic", "state.json")),
      false
    );
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(destination, { recursive: true, force: true });
  }
});

test("rejects an unsupported package version", () => {
  const source = makeTempDirectory();
  const destination = makeTempDirectory();

  try {
    createTestProject(source);

    const contextPackage = createContextPackage(source);
    contextPackage.formatVersion = "999.0";

    const packagePath = writePackage(
      source,
      "unsupported.json",
      contextPackage
    );

    assert.throws(
      () => importContextPackage(packagePath, destination),
      /failed AIC format validation/
    );

    assert.equal(
      existsSync(path.join(destination, ".aic", "state.json")),
      false
    );
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(destination, { recursive: true, force: true });
  }
});

test("refuses to overwrite an existing destination state", () => {
  const source = makeTempDirectory();
  const destination = makeTempDirectory();

  try {
    createTestProject(source, "Incoming Project");
    createTestProject(destination, "Existing Project");

    const originalStatePath = path.join(
      destination,
      ".aic",
      "state.json"
    );

    const originalState = readFileSync(
      originalStatePath,
      "utf8"
    );

    const contextPackage = createContextPackage(source);
    const packagePath = writePackage(
      source,
      "handoff.aic.json",
      contextPackage
    );

    assert.throws(
      () => importContextPackage(packagePath, destination),
      /project state already exists/
    );

    assert.equal(
      readFileSync(originalStatePath, "utf8"),
      originalState
    );
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(destination, { recursive: true, force: true });
  }
});

test("blocks a package containing a likely secret", () => {
  const source = makeTempDirectory();
  const destination = makeTempDirectory();

  try {
    createTestProject(source);

    const contextPackage = createContextPackage(source);
    contextPackage.context.constraints.push(
      "api_key=sk-" + "A".repeat(30)
    );

    const packagePath = writePackage(
      source,
      "secret-package.json",
      contextPackage
    );

    assert.throws(
      () => importContextPackage(packagePath, destination),
      /likely secrets were detected/
    );

    assert.equal(
      existsSync(path.join(destination, ".aic", "state.json")),
      false
    );
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(destination, { recursive: true, force: true });
  }
});

test("rejects a destination directory that does not exist", () => {
  const source = makeTempDirectory();

  try {
    createTestProject(source);

    const contextPackage = createContextPackage(source);
    const packagePath = writePackage(
      source,
      "handoff.aic.json",
      contextPackage
    );

    const missingDestination = path.join(
      source,
      "directory-that-does-not-exist"
    );

    assert.throws(
      () => importContextPackage(packagePath, missingDestination),
      /Import destination does not exist/
    );

    assert.equal(existsSync(missingDestination), false);
  } finally {
    rmSync(source, { recursive: true, force: true });
  }
});
