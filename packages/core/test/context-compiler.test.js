import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initProject, updateProjectDetails, setCurrentTask, addDecision, addConstraint, compileContext, createMemory } from "../dist/index.js";

test("Context Compiler - compiles basic state with provenance and excludes memories by default", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-compiler-test-"));
  
  try {
    initProject(tmpDir, { name: "Test Project", objective: "Verify context compilation" });
    updateProjectDetails(tmpDir, { status: "in_progress" });
    setCurrentTask(tmpDir, { title: "Implement Compiler", status: "in_progress" });
    addDecision(tmpDir, { title: "Use Pure Functions", decision: "Keep compiler pure", reason: "Determinism" });
    addConstraint(tmpDir, "Must pass all tests");

    // Add a personal memory that should NOT appear by default
    await createMemory(tmpDir, { category: "user_fact", content: "Secret preference" });

    const compiled = await compileContext(tmpDir);

    assert.strictEqual(compiled.format, "aic-compiled-context");
    assert.strictEqual(compiled.project.name, "Test Project");
    assert.strictEqual(compiled.project.status, "in_progress");
    assert.ok(compiled.currentTask);
    assert.strictEqual(compiled.currentTask.title, "Implement Compiler");
    assert.strictEqual(compiled.decisions.length, 1);
    assert.strictEqual(compiled.constraints.length, 1);

    // Memories must be undefined or empty by default (privacy boundary)
    assert.strictEqual(compiled.memories, undefined);

    // Verify provenance records exist for items
    assert.ok(compiled.provenance.length > 0);
    const projectProv = compiled.provenance.find(p => p.itemType === "project");
    assert.ok(projectProv);
    assert.strictEqual(projectProv.included, true);

    // Verify determinism: compiling twice yields identical structure and metadata (excluding timestamps)
    const compiledSecond = await compileContext(tmpDir);
    assert.strictEqual(compiledSecond.metadata.totalItemsConsidered, compiled.metadata.totalItemsConsidered);
    assert.strictEqual(compiledSecond.metadata.totalItemsIncluded, compiled.metadata.totalItemsIncluded);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Context Compiler - includes memories when explicitly opted in", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-compiler-test-mem-"));
  
  try {
    initProject(tmpDir, { name: "Memory Opt-in Test" });
    await createMemory(tmpDir, { category: "user_fact", content: "Vegetarian diet" });

    const compiledWithout = await compileContext(tmpDir, { includeMemories: false });
    assert.strictEqual(compiledWithout.memories, undefined);

    const compiledWith = await compileContext(tmpDir, { includeMemories: true });
    assert.ok(compiledWith.memories);
    assert.strictEqual(compiledWith.memories.length, 1);
    assert.strictEqual(compiledWith.memories[0].content, "Vegetarian diet");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Context Compiler - enforces character budget and truncation", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-compiler-test-budget-"));
  
  try {
    initProject(tmpDir, { name: "Budget Test" });
    addConstraint(tmpDir, "A very long constraint string designed to exceed tiny budget limit.");
    addConstraint(tmpDir, "Another constraint.");

    // Compile with an extremely tight character budget
    const compiled = await compileContext(tmpDir, { maxCharacters: 300 });
    assert.strictEqual(compiled.metadata.truncated, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});