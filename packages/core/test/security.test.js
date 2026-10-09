import test from "node:test";
import assert from "node:assert/strict";

import {
  scanForSecrets
} from "../dist/security.js";

import {
  validateWorkState
} from "../dist/validation.js";

const validState = {
  version: "0.1",
  project: {
    name: "Test Project",
    objective: "Test state validation",
    status: "in_progress"
  },
  currentTask: null,
  decisions: [],
  issues: [],
  relevantFiles: ["src/index.ts"],
  constraints: [],
  failedAttempts: [],
  createdAt: "2026-10-09T10:00:00.000Z",
  updatedAt: "2026-10-09T10:00:00.000Z"
};

test("accepts a valid AIC Work State", () => {
  assert.equal(validateWorkState(validState), true);
});

test("rejects a Work State with a missing project name", () => {
  const invalidState = structuredClone(validState);
  delete invalidState.project.name;

  assert.equal(validateWorkState(invalidState), false);
});

test("rejects an invalid project status", () => {
  const invalidState = {
    ...validState,
    project: {
      ...validState.project,
      status: "unknown"
    }
  };

  assert.equal(validateWorkState(invalidState), false);
});

test("detects likely API keys without returning the key", () => {
  const fakeKey = "sk-" + "A".repeat(30);
  const findings = scanForSecrets(
    `api_key=${fakeKey}`
  );

  assert.ok(findings.length > 0);

  const serialized = JSON.stringify(findings);

  assert.equal(serialized.includes(fakeKey), false);
  assert.ok(serialized.includes("[REDACTED]"));
});

test("detects a likely private key header", () => {
  const findings = scanForSecrets(
    "-----BEGIN PRIVATE KEY-----"
  );

  assert.ok(findings.some(
    (finding) => finding.rule === "Private key"
  ));
});

test("does not flag ordinary project text", () => {
  const findings = scanForSecrets(
    "The project uses TypeScript and stores decisions in JSON."
  );

  assert.equal(findings.length, 0);
});
