import test from "node:test";
import assert from "node:assert/strict";

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";

import os from "node:os";
import path from "node:path";

import {
  readMemories,
  writeMemories
} from "../dist/index.js";

import {
  AIC_MEMORY_VERSION
} from "@aic/protocol";

function makeTempDirectory() {
  return mkdtempSync(
    path.join(os.tmpdir(), "aic-memory-storage-")
  );
}

function memory(overrides = {}) {
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

function memoryFile(root) {
  return path.join(
    root,
    ".aic",
    "memory",
    "memories.json"
  );
}

function prepareMemoryFile(root, contents) {
  const filePath = memoryFile(root);

  mkdirSync(path.dirname(filePath), {
    recursive: true
  });

  writeFileSync(filePath, contents, "utf8");
}

test("returns an empty list when the memory file is missing", () => {
  const root = makeTempDirectory();

  try {
    assert.deepEqual(readMemories(root), []);

    assert.equal(
      readdirSync(root).length,
      0
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("returns an empty list when the root directory is missing", () => {
  const parent = makeTempDirectory();
  const missingRoot = path.join(parent, "not-created");

  try {
    assert.deepEqual(readMemories(missingRoot), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("writes and reads a memory successfully", () => {
  const root = makeTempDirectory();
  const expected = [memory()];

  try {
    const resultPath = writeMemories(root, expected);

    assert.equal(resultPath, memoryFile(root));
    assert.deepEqual(readMemories(root), expected);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("creates missing .aic and memory directories when writing", () => {
  const root = makeTempDirectory();

  try {
    writeMemories(root, [memory()]);

    assert.deepEqual(
      readMemories(root),
      [memory()]
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writes an empty memory list", () => {
  const root = makeTempDirectory();

  try {
    writeMemories(root, []);

    assert.deepEqual(readMemories(root), []);
    assert.equal(
      readFileSync(memoryFile(root), "utf8").trim(),
      "[]"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("persists multiple distinct memories", () => {
  const root = makeTempDirectory();

  const memories = [
    memory(),
    memory({
      id: "memory-002",
      category: "goal",
      content: "Work toward a data analyst role."
    }),
    memory({
      id: "memory-003",
      category: "working_style",
      content: "Show exact terminal commands."
    })
  ];

  try {
    writeMemories(root, memories);

    assert.deepEqual(readMemories(root), memories);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects malformed JSON without silently replacing it", () => {
  const root = makeTempDirectory();
  const filePath = memoryFile(root);

  try {
    writeMemories(root, [memory()]);

    const malformed = "{ this is not valid JSON ";
    writeFileSync(filePath, malformed, "utf8");

    assert.throws(
      () => readMemories(root),
      /Malformed JSON/
    );

    assert.throws(
      () => writeMemories(root, [memory()]),
      /Malformed JSON/
    );

    assert.equal(
      readFileSync(filePath, "utf8"),
      malformed
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a JSON object instead of an array", () => {
  const root = makeTempDirectory();

  try {
    prepareMemoryFile(root, JSON.stringify(memory()));

    assert.throws(
      () => readMemories(root),
      /expected a JSON array/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects invalid memory records loaded from disk", () => {
  const root = makeTempDirectory();

  try {
    prepareMemoryFile(
      root,
      JSON.stringify([
        memory({
          category: "unsupported-category"
        })
      ])
    );

    assert.throws(
      () => readMemories(root),
      /validation failed.*category is not supported/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects duplicate IDs when reading the store", () => {
  const root = makeTempDirectory();

  try {
    prepareMemoryFile(
      root,
      JSON.stringify([
        memory(),
        memory({ content: "A second memory with the same ID." })
      ])
    );

    assert.throws(
      () => readMemories(root),
      /duplicate memory ID "memory-001"/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects invalid replacement data without changing valid stored data", () => {
  const root = makeTempDirectory();
  const original = [memory()];

  try {
    writeMemories(root, original);

    assert.throws(
      () => writeMemories(
        root,
        [memory({ content: "   " })]
      ),
      /content must be a non-empty string/
    );

    assert.deepEqual(readMemories(root), original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects duplicate IDs in replacement data", () => {
  const root = makeTempDirectory();

  try {
    assert.throws(
      () => writeMemories(
        root,
        [
          memory(),
          memory({ content: "Duplicate ID" })
        ]
      ),
      /duplicate memory ID "memory-001"/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("replaces a valid store with a new valid list", () => {
  const root = makeTempDirectory();
  const first = [memory()];
  const replacement = [
    memory({
      id: "memory-002",
      category: "goal",
      content: "Learn practical data analytics."
    })
  ];

  try {
    writeMemories(root, first);
    writeMemories(root, replacement);

    assert.deepEqual(
      readMemories(root),
      replacement
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not modify project state while writing memories", () => {
  const root = makeTempDirectory();
  const aicDirectory = path.join(root, ".aic");
  const statePath = path.join(aicDirectory, "state.json");

  try {
    const originalState = JSON.stringify({
      project: { name: "Existing Project" }
    }, null, 2);

    mkdirSync(aicDirectory, { recursive: true });

    writeFileSync(
      statePath,
      originalState,
      "utf8"
    );

    writeMemories(root, [memory()]);

    assert.equal(
      readFileSync(statePath, "utf8"),
      originalState
    );

    assert.deepEqual(readMemories(root), [memory()]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not leave temporary files after a successful write", () => {
  const root = makeTempDirectory();

  try {
    writeMemories(root, [memory()]);

    const files = readdirSync(
      path.join(root, ".aic", "memory")
    );

    assert.deepEqual(files, ["memories.json"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});