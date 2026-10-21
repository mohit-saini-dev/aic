import type { AicWorkState, AicTask, AicDecision, AicIssue } from "@aic/protocol";
import { readState } from "./index.js";
import { readMemories } from "./memory-storage.js";

export interface CompilationOptions {
  maxCharacters?: number;
  includeMemories?: boolean;
  memoryCategory?: string;
  includeResolvedIssues?: boolean;
}

export interface ProvenanceRecord {
  itemType: "project" | "task" | "decision" | "issue" | "relevantFile" | "constraint" | "failedAttempt" | "memory";
  id?: string;
  source: string;
  included: boolean;
  reason?: string;
}

export interface CompiledContext {
  format: "aic-compiled-context";
  version: string;
  createdAt: string;
  project: {
    name: string;
    objective: string;
    status: string;
  };
  currentTask: AicTask | null;
  decisions: AicDecision[];
  issues: AicIssue[];
  relevantFiles: string[];
  constraints: string[];
  failedAttempts: string[];
  memories?: Array<{
    id: string;
    category: string;
    content: string;
    status: string;
  }>;
  provenance: ProvenanceRecord[];
  metadata: {
    totalItemsConsidered: number;
    totalItemsIncluded: number;
    budgetLimitChars?: number;
    estimatedChars: number;
    truncated: boolean;
  };
}

export async function compileContext(
  root: string,
  options: CompilationOptions = {}
): Promise<CompiledContext> {
  const state = readState(root);
  const now = new Date().toISOString();

  const provenance: ProvenanceRecord[] = [];
  let itemCountConsidered = 0;
  let itemCountIncluded = 0;

  // 1. Project info (mandatory foundational context)
  itemCountConsidered++;
  itemCountIncluded++;
  provenance.push({
    itemType: "project",
    source: "aic:work-state:project",
    included: true,
    reason: "Mandatory project root context."
  });

  // 2. Current Task (highest operational priority)
  let currentTask: AicTask | null = null;
  itemCountConsidered++;
  if (state.currentTask) {
    itemCountIncluded++;
    currentTask = state.currentTask;
    provenance.push({
      itemType: "task",
      id: state.currentTask.id,
      source: "aic:work-state:currentTask",
      included: true,
      reason: "Active execution task."
    });
  } else {
    provenance.push({
      itemType: "task",
      source: "aic:work-state:currentTask",
      included: false,
      reason: "No current task defined."
    });
  }

  // 3. Decisions
  const decisions: AicDecision[] = [];
  for (const dec of state.decisions) {
    itemCountConsidered++;
    itemCountIncluded++;
    decisions.push(dec);
    provenance.push({
      itemType: "decision",
      id: dec.id,
      source: "aic:work-state:decisions",
      included: true,
      reason: "Recorded architectural/project decision."
    });
  }

  // 4. Issues
  const issues: AicIssue[] = [];
  for (const issue of state.issues) {
    itemCountConsidered++;
    const includeThis = options.includeResolvedIssues || issue.status === "open";
    if (includeThis) {
      itemCountIncluded++;
      issues.push(issue);
      provenance.push({
        itemType: "issue",
        id: issue.id,
        source: "aic:work-state:issues",
        included: true,
        reason: `Issue included (status: ${issue.status}).`
      });
    } else {
      provenance.push({
        itemType: "issue",
        id: issue.id,
        source: "aic:work-state:issues",
        included: false,
        reason: "Resolved issue excluded by default options."
      });
    }
  }

  // 5. Relevant Files
  const relevantFiles: string[] = [];
  for (const file of state.relevantFiles) {
    itemCountConsidered++;
    itemCountIncluded++;
    relevantFiles.push(file);
    provenance.push({
      itemType: "relevantFile",
      source: "aic:work-state:relevantFiles",
      included: true,
      reason: "Relevant file reference."
    });
  }

  // 6. Constraints
  const constraints: string[] = [];
  for (const constraint of state.constraints) {
    itemCountConsidered++;
    itemCountIncluded++;
    constraints.push(constraint);
    provenance.push({
      itemType: "constraint",
      source: "aic:work-state:constraints",
      included: true,
      reason: "Project constraint."
    });
  }

  // 7. Failed Attempts (Negative knowledge)
  const failedAttempts: string[] = [];
  for (const attempt of state.failedAttempts) {
    itemCountConsidered++;
    itemCountIncluded++;
    failedAttempts.push(attempt);
    provenance.push({
      itemType: "failedAttempt",
      source: "aic:work-state:failedAttempts",
      included: true,
      reason: "Recorded failed attempt / negative knowledge."
    });
  }

  // 8. Memories (Optional opt-in, strictly segregated)
  let compiledMemories: CompiledContext["memories"] = undefined;
  if (options.includeMemories) {
    try {
      const allMemories = await readMemories(root);
      compiledMemories = [];
      for (const mem of allMemories) {
        itemCountConsidered++;
        if (mem.status === "active") {
          if (!options.memoryCategory || mem.category === options.memoryCategory) {
            itemCountIncluded++;
            compiledMemories.push({
              id: mem.id,
              category: mem.category,
              content: mem.content,
              status: mem.status
            });
            provenance.push({
              itemType: "memory",
              id: mem.id,
              source: "aic:memory-store",
              included: true,
              reason: "Explicitly opted-in active memory."
            });
          }
        }
      }
    } catch {
      // Proceed gracefully if memory store is missing
    }
  }

  const compiled: CompiledContext = {
    format: "aic-compiled-context",
    version: "0.1",
    createdAt: now,
    project: {
      name: state.project.name,
      objective: state.project.objective,
      status: state.project.status
    },
    currentTask,
    decisions,
    issues,
    relevantFiles,
    constraints,
    failedAttempts,
    memories: compiledMemories,
    provenance,
    metadata: {
      totalItemsConsidered: itemCountConsidered,
      totalItemsIncluded: itemCountIncluded,
      budgetLimitChars: options.maxCharacters,
      estimatedChars: 0,
      truncated: false
    }
  };

  let serialized = JSON.stringify(compiled, null, 2);
  compiled.metadata.estimatedChars = serialized.length;

  if (options.maxCharacters && serialized.length > options.maxCharacters) {
    while (serialized.length > options.maxCharacters && compiled.failedAttempts.length > 0) {
      compiled.failedAttempts.pop();
      compiled.metadata.truncated = true;
    }
    while (serialized.length > options.maxCharacters && compiled.constraints.length > 0) {
      compiled.constraints.pop();
      compiled.metadata.truncated = true;
    }
    while (serialized.length > options.maxCharacters && compiled.relevantFiles.length > 0) {
      compiled.relevantFiles.pop();
      compiled.metadata.truncated = true;
    }
    while (serialized.length > options.maxCharacters && compiled.decisions.length > 0) {
      compiled.decisions.pop();
      compiled.metadata.truncated = true;
    }
    serialized = JSON.stringify(compiled, null, 2);
    compiled.metadata.estimatedChars = serialized.length;
  }

  return compiled;
}