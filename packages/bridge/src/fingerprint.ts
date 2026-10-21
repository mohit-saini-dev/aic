import crypto from "node:crypto";
import { AgentHandoff } from "./types.js";

/**
 * Computes a stable SHA-256 fingerprint for canonical handoff content.
 * Excludes the fingerprint property itself to ensure determinism.
 */
export function computeHandoffFingerprint(
  handoff: Omit<AgentHandoff, "fingerprint">
): string {
  const canonicalObject = {
    schemaVersion: handoff.schemaVersion,
    task: {
      taskId: handoff.task.taskId,
      title: handoff.task.title,
      objective: handoff.task.objective,
      constraints: [...handoff.task.constraints].sort(),
      relevantFiles: [...handoff.task.relevantFiles].sort()
    },
    compiledContext: handoff.compiledContext,
    provenance: {
      projectRoot: handoff.provenance.projectRoot,
      compilerVersion: handoff.provenance.compilerVersion
    }
  };

  const jsonString = JSON.stringify(canonicalObject);
  return crypto.createHash("sha256").update(jsonString).digest("hex");
}