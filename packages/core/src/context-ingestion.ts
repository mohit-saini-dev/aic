import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readState, getStateFilePath } from "./index.js";
import { assertValidWorkState } from "./validation.js";
import { scanForSecrets } from "./security.js";
import type {
  AicWorkState,
  AicContextPackage,
  IngestionPreview,
  IngestionChangeRecord
} from "@aic/protocol";

function computeStateHash(state: AicWorkState): string {
  return crypto.createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

export function previewIngestion(
  projectRoot: string,
  packagePath: string
): IngestionPreview {
  const currentState = readState(projectRoot);
  const stateHashBefore = computeStateHash(currentState);

  const absolutePackagePath = path.resolve(projectRoot, packagePath);

  if (!fs.existsSync(absolutePackagePath)) {
    throw new Error(`Ingestion file not found at: ${packagePath}`);
  }

  const rawContent = fs.readFileSync(absolutePackagePath, "utf8");
  const securityAlerts: string[] = [];

  // Security scan for credentials
  const secrets = scanForSecrets(rawContent);
  if (secrets.length > 0) {
    securityAlerts.push(`Ingestion payload contains likely sensitive credentials.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return {
      valid: false,
      format: "unknown",
      version: "unknown",
      stateHashBefore,
      summary: { totalItems: 0, toAdd: 0, toUpdate: 0, toSkip: 0, conflicts: 0, rejected: 1 },
      changes: [{ type: "file" as any, action: "reject", summary: "File is not valid JSON." }],
      securityAlerts
    };
  }

  const pkg = parsed as Partial<AicContextPackage>;

  if (!pkg || typeof pkg !== "object" || pkg.format !== "aic-context-package") {
    return {
      valid: false,
      format: pkg?.format ?? "unknown",
      version: pkg?.formatVersion ?? "unknown",
      stateHashBefore,
      summary: { totalItems: 0, toAdd: 0, toUpdate: 0, toSkip: 0, conflicts: 0, rejected: 1 },
      changes: [{ type: "file" as any, action: "reject", summary: "Invalid or unsupported package format." }],
      securityAlerts
    };
  }

  const contextVersion = pkg.formatVersion ?? "1.0";
  const incomingContext = pkg.context;
  const changes: IngestionChangeRecord[] = [];

  let toAdd = 0;
  let toUpdate = 0;
  let toSkip = 0;
  let conflicts = 0;

  if (incomingContext) {
    // Decisions analysis
    for (const dec of incomingContext.decisions || []) {
      const match = currentState.decisions.find((d) => d.id === dec.id || d.title === dec.title);
      if (!match) {
        changes.push({ id: dec.id, type: "decision", action: "add", summary: `Add decision: "${dec.title}"` });
        toAdd++;
      } else if (match.decision === dec.decision) {
        changes.push({ id: dec.id, type: "decision", action: "skip", summary: `Skip duplicate decision: "${dec.title}"` });
        toSkip++;
      } else {
        changes.push({ id: dec.id, type: "decision", action: "conflict", summary: `Conflict in decision: "${dec.title}"` });
        conflicts++;
      }
    }

    // Constraints analysis
    for (const c of incomingContext.constraints || []) {
      if (currentState.constraints.includes(c)) {
        changes.push({ type: "constraint", action: "skip", summary: `Skip duplicate constraint: "${c}"` });
        toSkip++;
      } else {
        changes.push({ type: "constraint", action: "add", summary: `Add constraint: "${c}"` });
        toAdd++;
      }
    }

    // Relevant Files analysis
    for (const f of incomingContext.relevantFiles || []) {
      if (currentState.relevantFiles.includes(f)) {
        changes.push({ type: "file", action: "skip", summary: `Skip duplicate file: "${f}"` });
        toSkip++;
      } else {
        changes.push({ type: "file", action: "add", summary: `Add relevant file: "${f}"` });
        toAdd++;
      }
    }
  }

  const valid = securityAlerts.length === 0 && conflicts === 0;

  return {
    valid,
    format: pkg.format,
    version: contextVersion,
    stateHashBefore,
    summary: {
      totalItems: toAdd + toUpdate + toSkip + conflicts,
      toAdd,
      toUpdate,
      toSkip,
      conflicts,
      rejected: 0
    },
    changes,
    securityAlerts
  };
}

export function applyIngestion(
  projectRoot: string,
  packagePath: string,
  preview: IngestionPreview
): AicWorkState {
  const currentState = readState(projectRoot);
  const currentHash = computeStateHash(currentState);

  if (currentHash !== preview.stateHashBefore) {
    throw new Error("Stale ingestion preview: project state has changed since preview was generated.");
  }

  if (!preview.valid) {
    throw new Error("Cannot apply invalid ingestion preview. Resolve conflicts or security alerts first.");
  }

  const rawContent = fs.readFileSync(path.resolve(projectRoot, packagePath), "utf8");
  const pkg = JSON.parse(rawContent) as AicContextPackage;
  const draftState: AicWorkState = JSON.parse(JSON.stringify(currentState));

  for (const change of preview.changes) {
    if (change.action === "add") {
      if (change.type === "decision") {
        const item = pkg.context.decisions.find((d) => d.id === change.id || `Add decision: "${d.title}"` === change.summary);
        if (item) draftState.decisions.push(item);
      } else if (change.type === "constraint") {
        const text = change.summary.replace('Add constraint: "', "").slice(0, -1);
        draftState.constraints.push(text);
      } else if (change.type === "file") {
        const text = change.summary.replace('Add relevant file: "', "").slice(0, -1);
        draftState.relevantFiles.push(text);
      }
    }
  }

  draftState.updatedAt = new Date().toISOString();
  assertValidWorkState(draftState);

  fs.writeFileSync(getStateFilePath(projectRoot), JSON.stringify(draftState, null, 2) + "\n", "utf8");
  return draftState;
}