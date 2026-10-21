import path from "node:path";
import { compileContext } from "@aic/core";
import { AgentTask, AgentHandoff, HandoffOptions } from "./types.js";
import { computeHandoffFingerprint } from "./fingerprint.js";

export function generateAgentHandoff(
  projectRoot: string,
  task: AgentTask,
  options: HandoffOptions = {}
): AgentHandoff {
  if (!task || !task.taskId || !task.objective) {
    throw new Error("Invalid task input: taskId and objective are required.");
  }

  // Compile context using M9 compiler (privacy by default: memories excluded unless opted in)
  const compiledContext = compileContext(projectRoot, {
    includeMemories: options.includeMemories ?? false,
    maxCharacters: options.maxCharacters ?? 10000
  });

  const resolvedRoot = path.resolve(projectRoot);
  const handoffId = `handoff-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const compiledAt = new Date().toISOString();

  const partialHandoff: Omit<AgentHandoff, "fingerprint"> = {
    schemaVersion: "1.0",
    handoffId,
    task: {
      taskId: task.taskId,
      title: task.title,
      objective: task.objective,
      constraints: task.constraints || [],
      relevantFiles: task.relevantFiles || []
    },
    compiledContext,
    provenance: {
      projectRoot: resolvedRoot,
      compilerVersion: "0.1.0",
      compiledAt
    }
  };

  const fingerprint = computeHandoffFingerprint(partialHandoff);

  return {
    ...partialHandoff,
    fingerprint
  };
}