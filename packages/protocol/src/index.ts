export const AIC_PROTOCOL_VERSION = "0.1";

export type ProjectStatus =
  | "planned"
  | "in_progress"
  | "blocked"
  | "completed";

export type TaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "completed";

export interface AicProject {
  name: string;
  objective: string;
  status: ProjectStatus;
}

export interface AicTask {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface AicDecision {
  id: string;
  title: string;
  decision: string;
  reason?: string;
}

export interface AicIssue {
  id: string;
  title: string;
  description: string;
  status: "open" | "resolved";
}

export interface AicWorkState {
  version: string;
  project: AicProject;
  currentTask: AicTask | null;
  decisions: AicDecision[];
  issues: AicIssue[];
  relevantFiles: string[];
  constraints: string[];
  failedAttempts: string[];
  createdAt: string;
  updatedAt: string;
}

export {
  AIC_CONTEXT_PACKAGE_VERSION
} from "./context-package.js";

export type {
  AicContextPackage
} from "./context-package.js";

export {
  AIC_MEMORY_VERSION,
  MEMORY_CATEGORIES,
  validateAicMemory
} from "./memory.js";

export type {
  AicMemory,
  MemoryCategory,
  MemorySource,
  MemoryStatus,
  MemoryValidationResult
} from "./memory.js";