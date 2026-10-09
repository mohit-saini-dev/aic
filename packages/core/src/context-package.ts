import {
  AIC_CONTEXT_PACKAGE_VERSION,
  AIC_PROTOCOL_VERSION
} from "@aic/protocol";

import type {
  AicContextPackage,
  AicWorkState
} from "@aic/protocol";

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";

import path from "node:path";

import { readState } from "./index.js";
import { validateWorkState } from "./validation.js";
import { scanForSecrets } from "./security.js";

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function validateContextPackage(
  value: unknown
): value is AicContextPackage {
  if (!isObject(value)) return false;

  if (value.format !== "aic-context-package") return false;

  if (
    value.formatVersion !== AIC_CONTEXT_PACKAGE_VERSION
  ) {
    return false;
  }

  if (typeof value.createdAt !== "string") return false;

  if (
    Number.isNaN(Date.parse(value.createdAt)) ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value.createdAt)
  ) {
    return false;
  }

  if (!isObject(value.source)) return false;
  if (value.source.tool !== "aic") return false;

  if (
    value.source.protocolVersion !== AIC_PROTOCOL_VERSION
  ) {
    return false;
  }

  if (!isObject(value.context)) return false;

  const context = value.context;

  // Reuse canonical Work State validator
  const candidateState = {
    version: value.source.protocolVersion,
    project: context.project,
    currentTask: context.currentTask,
    decisions: context.decisions,
    issues: context.issues,
    relevantFiles: context.relevantFiles,
    constraints: context.constraints,
    failedAttempts: context.failedAttempts,
    createdAt: value.createdAt,
    updatedAt: value.createdAt
  };

  return validateWorkState(candidateState);
}

export function createContextPackage(
  root: string
): AicContextPackage {
  const state = readState(root);

  const contextPackage: AicContextPackage = {
    format: "aic-context-package",
    formatVersion: AIC_CONTEXT_PACKAGE_VERSION,
    createdAt: new Date().toISOString(),

    source: {
      tool: "aic",
      protocolVersion: AIC_PROTOCOL_VERSION
    },

    context: {
      project: state.project,
      currentTask: state.currentTask,
      decisions: state.decisions,
      issues: state.issues,
      relevantFiles: state.relevantFiles,
      constraints: state.constraints,
      failedAttempts: state.failedAttempts
    }
  };

  if (!validateContextPackage(contextPackage)) {
    throw new Error(
      "AIC generated a context package that failed validation."
    );
  }

  return contextPackage;
}

export function exportContextPackage(
  root: string,
  outputFile: string
): string {
  const outputPath = path.resolve(root, outputFile);

  if (existsSync(outputPath)) {
    throw new Error(
      `Export file already exists; refusing to overwrite it: ${outputPath}`
    );
  }

  const contextPackage = createContextPackage(root);
  const serialized = JSON.stringify(contextPackage, null, 2) + "\n";

  const findings = scanForSecrets(serialized);

  if (findings.length > 0) {
    const summary = findings
      .map((finding) => `${finding.rule} on line ${finding.line}`)
      .join("; ");

    throw new Error(
      `Context export stopped because likely secrets were detected: ${summary}. Review and remove sensitive values before exporting.`
    );
  }

  writeFileSync(outputPath, serialized, {
    encoding: "utf8",
    flag: "wx"
  });

  return outputPath;
}

export function inspectContextPackage(
  inputFile: string
): AicContextPackage {
  const inputPath = path.resolve(inputFile);
  const raw = readFileSync(inputPath, "utf8");

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "The context package is not valid JSON."
    );
  }

  if (!validateContextPackage(parsed)) {
    throw new Error(
      "The context package failed AIC format validation."
    );
  }

  return parsed;
}

export function importContextPackage(
  inputFile: string,
  destinationRoot: string
): string {
  const root = path.resolve(destinationRoot);

  if (!existsSync(root)) {
    throw new Error(
      `Import destination does not exist: ${root}`
    );
  }

  // Validate the package before changing the destination.
  const contextPackage = inspectContextPackage(inputFile);
  const serializedPackage = JSON.stringify(contextPackage);

  const findings = scanForSecrets(serializedPackage);

  if (findings.length > 0) {
    const summary = findings
      .map((finding) => `${finding.rule} on line ${finding.line}`)
      .join("; ");

    throw new Error(
      `Context import stopped because likely secrets were detected: ${summary}. Review the package before importing.`
    );
  }

  const aicDirectory = path.join(root, ".aic");
  const stateFile = path.join(aicDirectory, "state.json");
  const snapshotsDirectory = path.join(aicDirectory, "snapshots");

  // Never overwrite an existing project state.
  if (existsSync(stateFile)) {
    throw new Error(
      `Import refused; project state already exists: ${stateFile}`
    );
  }

  const now = new Date().toISOString();

  const importedState: AicWorkState = {
    version: AIC_PROTOCOL_VERSION,
    project: contextPackage.context.project,
    currentTask: contextPackage.context.currentTask,
    decisions: contextPackage.context.decisions,
    issues: contextPackage.context.issues,
    relevantFiles: contextPackage.context.relevantFiles,
    constraints: contextPackage.context.constraints,
    failedAttempts: contextPackage.context.failedAttempts,
    createdAt: now,
    updatedAt: now
  };

  // Validate the reconstructed state before writing it.
  if (!validateWorkState(importedState)) {
    throw new Error(
      "Imported context failed AIC Work State validation."
    );
  }

  mkdirSync(aicDirectory, { recursive: true });
  mkdirSync(snapshotsDirectory, { recursive: true });

  // "wx" makes the write fail if another process has created the file.
  writeFileSync(
    stateFile,
    JSON.stringify(importedState, null, 2) + "\n",
    {
      encoding: "utf8",
      flag: "wx"
    }
  );

  return stateFile;
}
