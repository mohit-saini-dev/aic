import test from "node:test";
import assert from "node:assert/strict";

import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";

import os from "node:os";
import path from "node:path";

import {
  initProject
} from "../dist/index.js";

import {
  createContextPackage,
  exportContextPackage,
  validateContextPackage
} from "../dist/context-package.js";

function makeTempDirectory() {
  return mkdtempSync(
    path.join(os.tmpdir(), "aic-package-test-")
  );
}

function createTestProject(root) {
  initProject(root, {
    name: "Context Package Test",
    objective: "Test safe context package export"
  });
}

test("creates a valid context package from project state", () => {
  const root = makeTempDirectory();

  try {
    createTestProject(root);

    const contextPackage = createContextPackage(root);

    assert.equal(
      contextPackage.format,
      "aic-context-package"
    );

    assert.equal(
      contextPackage.context.project.name,
      "Context Package Test"
    );

    assert.equal(
      validateContextPackage(contextPackage),
      true
    );

    assert.equal(
      "createdAt" in contextPackage.context,
      false
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a package with an unsupported format version", () => {
  const root = makeTempDirectory();

  try {
    createTestProject(root);

    const contextPackage = createContextPackage(root);

    const invalidPackage = {
      ...contextPackage,
      formatVersion: "999.0"
    };

    assert.equal(
      validateContextPackage(invalidPackage),
      false
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("exports a JSON package to the requested file", () => {
  const root = makeTempDirectory();

  try {
    createTestProject(root);

    const outputFile = "handoff.aic.json";
    const exportedPath = exportContextPackage(root, outputFile);

    const parsed = JSON.parse(
      readFileSync(exportedPath, "utf8")
    );

    assert.equal(exportedPath, path.join(root, outputFile));
    assert.equal(validateContextPackage(parsed), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses to overwrite an existing export file", () => {
  const root = makeTempDirectory();

  try {
    createTestProject(root);

    const outputFile = "handoff.aic.json";
    const outputPath = path.join(root, outputFile);

    writeFileSync(outputPath, "keep this file", {
      encoding: "utf8"
    });

    assert.throws(
      () => exportContextPackage(root, outputFile),
      /already exists/
    );

    assert.equal(
      readFileSync(outputPath, "utf8"),
      "keep this file"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("blocks export when likely secrets appear in context", () => {
  const root = makeTempDirectory();

  try {
    createTestProject(root);

    const statePath = path.join(root, ".aic", "state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));

    state.constraints.push(
      "api_key=sk-" + "A".repeat(30)
    );

    writeFileSync(
      statePath,
      JSON.stringify(state, null, 2) + "\n",
      "utf8"
    );

    assert.throws(
      () => exportContextPackage(root, "handoff.aic.json"),
      /likely secrets were detected/
    );

    assert.equal(
      pathExists(path.join(root, "handoff.aic.json")),
      false
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function pathExists(filePath) {
  try {
    readFileSync(filePath);
    return true;
  } catch {
    return false;
  }
}
