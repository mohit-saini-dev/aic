
import crypto from "node:crypto";
import type { AgentHandoff } from "./types.js";

/**
 * Computes a stable SHA-256 fingerprint for canonical handoff content.
 * Excludes generated identifiers and timestamps that do not represent
 * changes to the underlying task or compiled project context.
 */
export function computeHandoffFingerprint(
  handoff: Omit<AgentHandoff, "fingerprint">
): string {
  const {
    createdAt: _createdAt,
    ...stableCompiledContext
  } = handoff.compiledContext;

  const canonicalObject = {
    schemaVersion: handoff.schemaVersion,
    task: {
      taskId: handoff.task.taskId,
      title: handoff.task.title ?? null,
      objective: handoff.task.objective,
      constraints: [...handoff.task.constraints].sort(),
      relevantFiles: [...handoff.task.relevantFiles].sort()
    },
    compiledContext: stableCompiledContext,
    provenance: {
      projectRoot: handoff.provenance.projectRoot,
      compilerVersion: handoff.provenance.compilerVersion
    }
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalObject))
    .digest("hex");
}
