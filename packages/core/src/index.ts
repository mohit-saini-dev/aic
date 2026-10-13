import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import type { AicWorkState } from "@aic/protocol";
import { assertValidWorkState } from "./validation.js";

export * from "./validation.js";
export * from "./security.js";

const AIC_DIRECTORY = ".aic";
const STATE_FILE = "state.json";
const SNAPSHOT_DIRECTORY = "snapshots";

export type ProjectStatus = {
  initialized: boolean;
  projectName?: string;
  root: string;
  stateFile: string;
};

export type InitOptions = {
  name?: string;
  objective?: string;
};

export function getAicDirectory(root: string): string {
  return path.join(root, AIC_DIRECTORY);
}

export function getStateFilePath(root: string): string {
  return path.join(getAicDirectory(root), STATE_FILE);
}

export function getStatus(root: string): ProjectStatus {
  const absoluteRoot = path.resolve(root);
  const stateFile = getStateFilePath(absoluteRoot);

  if (!existsSync(stateFile)) {
    return {
      initialized: false,
      root: absoluteRoot,
      stateFile
    };
  }

  try {
    const raw = readFileSync(stateFile, "utf8");
    const state: unknown = JSON.parse(raw);
    assertValidWorkState(state);

    return {
      initialized: true,
      projectName: state.project.name,
      root: absoluteRoot,
      stateFile
    };
  } catch (error) {
    throw new Error(
      `AIC state exists at ${stateFile} but is unreadable or invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export function initProject(root: string, options: InitOptions = {}): AicWorkState {
  const absoluteRoot = path.resolve(root);
  const status = getStatus(absoluteRoot);

  if (status.initialized) {
    throw new Error(`AIC is already initialized in ${absoluteRoot}`);
  }

  const aicDirectory = getAicDirectory(absoluteRoot);
  mkdirSync(aicDirectory, { recursive: true });

  const now = new Date().toISOString();
  const state: AicWorkState = {
    version: "0.1",
    project: {
      name: options.name || path.basename(absoluteRoot),
      objective: options.objective || "No objective defined yet.",
      status: "planned"
    },
    currentTask: null,
    decisions: [],
    issues: [],
    relevantFiles: [],
    constraints: [],
    failedAttempts: [],
    createdAt: now,
    updatedAt: now
  };

  assertValidWorkState(state);

  writeFileSync(
    getStateFilePath(absoluteRoot),
    JSON.stringify(state, null, 2) + "\n",
    "utf8"
  );

  return state;
}

export function readState(root: string): AicWorkState {
  const absoluteRoot = path.resolve(root);
  const status = getStatus(absoluteRoot);

  if (!status.initialized) {
    throw new Error(`AIC is not initialized in ${absoluteRoot}`);
  }

  const raw = readFileSync(status.stateFile, "utf8");
  const state: unknown = JSON.parse(raw);

  assertValidWorkState(state);

  return state;
}

export function createSnapshot(root: string): string {
  const absoluteRoot = path.resolve(root);

  const state = readState(absoluteRoot);

  const snapshotDirectory = path.join(
    getAicDirectory(absoluteRoot),
    SNAPSHOT_DIRECTORY
  );

  mkdirSync(snapshotDirectory, { recursive: true });

  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, "-");

  for (let attempt = 0; attempt < 100; attempt++) {
    const suffix = attempt === 0 ? "" : `-${attempt}`;

    const snapshotPath = path.join(
      snapshotDirectory,
      `state-${timestamp}${suffix}.json`
    );

    try {
      writeFileSync(
        snapshotPath,
        JSON.stringify(state, null, 2) + "\n",
        { encoding: "utf8", flag: "wx" }
      );

      return snapshotPath;
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error
          ? error.code
          : undefined;

      if (code !== "EEXIST") {
        throw error;
      }
    }
  }

  throw new Error(
    "Unable to create a unique snapshot filename after 100 attempts."
  );
}

export {
  createContextPackage,
  exportContextPackage,
  inspectContextPackage,
  importContextPackage,
  validateContextPackage
} from "./context-package.js";

export {
  readMemories,
  writeMemories
} from "./memory-storage.js";