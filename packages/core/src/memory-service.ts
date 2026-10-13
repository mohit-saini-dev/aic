import * as crypto from 'node:crypto';
import type { AicMemory } from '@aic/protocol';
import { validateAicMemory } from '@aic/protocol';
import { readMemories, writeMemories } from './memory-storage.js';

export interface CreateMemoryInput {
  category: string;
  content: string;
  status?: string;
  expiresAt?: string | null;
}

export interface UpdateMemoryInput {
  content?: string;
  category?: string;
  status?: string;
  expiresAt?: string | null;
}

export async function createMemory(
  rootDirectory: string,
  input: CreateMemoryInput
): Promise<AicMemory> {
  const now = new Date().toISOString();
  const rawMemory = {
    schemaVersion: "1.0" as const,
    id: crypto.randomUUID(),
    category: input.category,
    content: input.content,
    status: input.status || 'active',
    source: 'user_provided',
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt !== undefined ? input.expiresAt : null,
  };

  const validated = validateAicMemory(rawMemory);
  if (!validated.valid) {
    throw new Error(`Invalid memory created: ${validated.errors.join(', ')}`);
  }

  const memory = rawMemory as unknown as AicMemory;
  const memories = await readMemories(rootDirectory);
  memories.push(memory);
  await writeMemories(rootDirectory, memories);

  return memory;
}

export async function getMemory(
  rootDirectory: string,
  id: string
): Promise<AicMemory | null> {
  const memories = await readMemories(rootDirectory);
  const found = memories.find((m) => m.id === id);
  return found || null;
}

export async function listMemories(
  rootDirectory: string,
  filter?: { category?: string; status?: string }
): Promise<AicMemory[]> {
  const memories = await readMemories(rootDirectory);
  return memories.filter((m) => {
    if (filter?.category && m.category !== filter.category) {
      return false;
    }
    if (filter?.status && m.status !== filter.status) {
      return false;
    }
    return true;
  });
}

export async function updateMemory(
  rootDirectory: string,
  id: string,
  updates: UpdateMemoryInput
): Promise<AicMemory> {
  const memories = await readMemories(rootDirectory);
  const index = memories.findIndex((m) => m.id === id);
  if (index === -1) {
    throw new Error(`Memory with ID ${id} not found.`);
  }

  const existing = memories[index];
  const updatedRecord = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    schemaVersion: existing.schemaVersion,
    source: existing.source,
    updatedAt: new Date().toISOString(),
  };

  const validated = validateAicMemory(updatedRecord);
  if (!validated.valid) {
    throw new Error(`Invalid updated memory: ${validated.errors.join(', ')}`);
  }

  const memory = updatedRecord as unknown as AicMemory;
  memories[index] = memory;
  await writeMemories(rootDirectory, memories);

  return memory;
}

export async function archiveMemory(
  rootDirectory: string,
  id: string
): Promise<AicMemory> {
  return updateMemory(rootDirectory, id, { status: 'archived' });
}

export async function deleteMemory(
  rootDirectory: string,
  id: string
): Promise<boolean> {
  const memories = await readMemories(rootDirectory);
  const index = memories.findIndex((m) => m.id === id);
  if (index === -1) {
    return false;
  }

  memories.splice(index, 1);
  await writeMemories(rootDirectory, memories);
  return true;
}