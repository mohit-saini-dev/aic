import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  createMemory,
  getMemory,
  listMemories,
  updateMemory,
  archiveMemory,
  deleteMemory,
} from '../dist/memory-service.js';

describe('Memory Service', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aic-service-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('createMemory generates default fields, validates, and persists', async () => {
    const memory = await createMemory(tempDir, {
      category: 'preference',
      content: 'Prefers dark mode in IDE',
    });

    assert.ok(memory.id);
    assert.equal(memory.category, 'preference');
    assert.equal(memory.content, 'Prefers dark mode in IDE');
    assert.equal(memory.status, 'active');
    assert.equal(memory.source, 'user_provided');
    assert.ok(memory.createdAt);
    assert.ok(memory.updatedAt);

    const retrieved = await getMemory(tempDir, memory.id);
    assert.deepEqual(retrieved, memory);
  });

  test('getMemory returns null for non-existent ID', async () => {
    const memory = await getMemory(tempDir, 'non-existent-id');
    assert.equal(memory, null);
  });

  test('listMemories returns all memories and supports filtering by category and status', async () => {
    const m1 = await createMemory(tempDir, {
      category: 'preference',
      content: 'Prefers TypeScript',
    });
    const m2 = await createMemory(tempDir, {
      category: 'user_fact',
      content: 'Monorepo uses npm workspaces',
    });

    const all = await listMemories(tempDir);
    assert.equal(all.length, 2);

    const preferences = await listMemories(tempDir, { category: 'preference' });
    assert.equal(preferences.length, 1);
    assert.equal(preferences[0].id, m1.id);

    await archiveMemory(tempDir, m1.id);

    const activeOnly = await listMemories(tempDir, { status: 'active' });
    assert.equal(activeOnly.length, 1);
    assert.equal(activeOnly[0].id, m2.id);

    const archivedOnly = await listMemories(tempDir, { status: 'archived' });
    assert.equal(archivedOnly.length, 1);
    assert.equal(archivedOnly[0].id, m1.id);
  });

  test('updateMemory modifies editable fields while keeping immutable fields intact', async () => {
    const original = await createMemory(tempDir, {
      category: 'goal',
      content: 'Original content',
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const updated = await updateMemory(tempDir, original.id, {
      content: 'Updated content',
      id: 'fake-id-attempt',
      createdAt: '2020-01-01T00:00:00.000Z',
    });

    assert.equal(updated.id, original.id);
    assert.equal(updated.createdAt, original.createdAt);
    assert.equal(updated.content, 'Updated content');
    assert.notEqual(updated.updatedAt, original.updatedAt);
  });

  test('archiveMemory sets status to archived', async () => {
    const memory = await createMemory(tempDir, {
      category: 'working_style',
      content: 'Always run unit tests before commit',
    });

    const archived = await archiveMemory(tempDir, memory.id);
    assert.equal(archived.status, 'archived');

    const fetched = await getMemory(tempDir, memory.id);
    assert.equal(fetched.status, 'archived');
  });

  test('deleteMemory permanently removes a record', async () => {
    const memory = await createMemory(tempDir, {
      category: 'preference',
      content: 'Temporary record',
    });

    const success = await deleteMemory(tempDir, memory.id);
    assert.equal(success, true);

    const fetched = await getMemory(tempDir, memory.id);
    assert.equal(fetched, null);
  });

  test('deleteMemory returns false when ID does not exist', async () => {
    const success = await deleteMemory(tempDir, 'non-existent-id');
    assert.equal(success, false);
  });
});