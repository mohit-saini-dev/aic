import {
  randomUUID
} from "node:crypto";

import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";

import path from "node:path";

import {
  validateAicMemory
} from "@aic/protocol";

import type {
  AicMemory
} from "@aic/protocol";

function getMemoryFilePath(root: string): string {
  return path.join(
    path.resolve(root),
    ".aic",
    "memory",
    "memories.json"
  );
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function validateMemoryList(value: unknown): AicMemory[] {
  if (!Array.isArray(value)) {
    throw new Error(
      "Invalid memory store: expected a JSON array."
    );
  }

  const memories: AicMemory[] = [];
  const seenIds = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const candidate: unknown = value[index];
    const result = validateAicMemory(candidate);

    if (!result.valid) {
      throw new Error(
        `Invalid memory at index ${index}: ${result.errors.join(" ")}`
      );
    }

    const memory = candidate as AicMemory;

    if (seenIds.has(memory.id)) {
      throw new Error(
        `Invalid memory store: duplicate memory ID "${memory.id}".`
      );
    }

    seenIds.add(memory.id);
    memories.push(memory);
  }

  return memories;
}

export function readMemories(root: string): AicMemory[] {
  const filePath = getMemoryFilePath(root);

  let raw: string;

  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw new Error(
      `Unable to read AIC memory store at "${filePath}".`,
      { cause: error }
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Malformed JSON in AIC memory store at "${filePath}".`,
      { cause: error }
    );
  }

  try {
    return validateMemoryList(parsed);
  } catch (error) {
    throw new Error(
      `AIC memory store validation failed at "${filePath}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
}

export function writeMemories(
  root: string,
  memories: AicMemory[]
): string {
  const filePath = getMemoryFilePath(root);
  const directory = path.dirname(filePath);

  readMemories(root);

  const validated = validateMemoryList(memories);

  mkdirSync(directory, { recursive: true });

  const temporaryPath = path.join(
    directory,
    `.memories.${randomUUID()}.tmp`
  );

  try {
    writeFileSync(
      temporaryPath,
      `${JSON.stringify(validated, null, 2)}\n`,
      {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600
      }
    );

    renameSync(temporaryPath, filePath);

    return filePath;
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Temporary file may not exist or already be gone.
    }

    throw new Error(
      `Unable to save AIC memory store at "${filePath}".`,
      { cause: error }
    );
  }
}