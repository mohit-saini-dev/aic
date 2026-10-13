import test from "node:test";
import assert from "node:assert/strict";

import {
  AIC_MEMORY_VERSION,
  MEMORY_CATEGORIES,
  validateAicMemory
} from "../dist/index.js";

function makeMemory(overrides = {}) {
  return {
    id: "memory-001",
    schemaVersion: AIC_MEMORY_VERSION,
    category: "preference",
    content: "Prefer concise, step-by-step explanations.",
    source: "user_provided",
    status: "active",
    createdAt: "2026-10-13T06:00:00.000Z",
    updatedAt: "2026-10-13T06:00:00.000Z",
    expiresAt: null,
    ...overrides
  };
}

test("accepts a valid user-created memory", () => {
  const result = validateAicMemory(makeMemory());

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("supports all approved memory categories", () => {
  for (const category of MEMORY_CATEGORIES) {
    const result = validateAicMemory(
      makeMemory({ category })
    );

    assert.equal(
      result.valid,
      true,
      `Expected category "${category}" to be valid`
    );
  }
});

test("accepts optional expiry when null", () => {
  const result = validateAicMemory(
    makeMemory({ expiresAt: null })
  );

  assert.equal(result.valid, true);
});

test("accepts a valid future expiry timestamp", () => {
  const result = validateAicMemory(
    makeMemory({
      expiresAt: "2027-01-01T00:00:00.000Z"
    })
  );

  assert.equal(result.valid, true);
});

test("rejects non-object input", () => {
  const result = validateAicMemory(null);

  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test("rejects empty ID and content", () => {
  const result = validateAicMemory(
    makeMemory({
      id: "  ",
      content: ""
    })
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.startsWith("id ")));
  assert.ok(
    result.errors.some(error => error.startsWith("content "))
  );
});

test("rejects unsupported categories and statuses", () => {
  const result = validateAicMemory(
    makeMemory({
      category: "personality",
      status: "deleted"
    })
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.startsWith("category ")));
  assert.ok(result.errors.some(error => error.startsWith("status ")));
});

test("rejects unsupported source values", () => {
  const result = validateAicMemory(
    makeMemory({ source: "automatic" })
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.startsWith("source ")));
});

test("rejects unsupported schema versions", () => {
  const result = validateAicMemory(
    makeMemory({ schemaVersion: "99.0" })
  );

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(error =>
      error.startsWith("schemaVersion ")
    )
  );
});

test("rejects timestamps without an explicit timezone", () => {
  const result = validateAicMemory(
    makeMemory({
      createdAt: "2026-10-13T06:00:00",
      updatedAt: "2026-10-13T06:00:00"
    })
  );

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(error => error.startsWith("createdAt "))
  );
  assert.ok(
    result.errors.some(error => error.startsWith("updatedAt "))
  );
});

test("rejects updatedAt earlier than createdAt", () => {
  const result = validateAicMemory(
    makeMemory({
      createdAt: "2026-10-13T08:00:00.000Z",
      updatedAt: "2026-10-13T06:00:00.000Z"
    })
  );

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(error =>
      error.includes("updatedAt cannot be earlier")
    )
  );
});

test("rejects expiry at or before creation time", () => {
  const result = validateAicMemory(
    makeMemory({
      expiresAt: "2026-10-13T06:00:00.000Z"
    })
  );

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(error =>
      error.includes("expiresAt must be later")
    )
  );
});

test("rejects invalid expiry timestamps", () => {
  const result = validateAicMemory(
    makeMemory({ expiresAt: "not-a-date" })
  );

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(error => error.startsWith("expiresAt "))
  );
});