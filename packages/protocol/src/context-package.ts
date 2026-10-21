import type { AicWorkState } from "./index.js";

export const AIC_CONTEXT_PACKAGE_VERSION = "1.0";

export interface AicContextPackage {
  format: "aic-context-package";
  formatVersion: string;
  createdAt: string;

  source: {
    tool: "aic";
    protocolVersion: string;
  };

  context: {
    project: AicWorkState["project"];
    currentTask: AicWorkState["currentTask"];
    decisions: AicWorkState["decisions"];
    issues: AicWorkState["issues"];
    relevantFiles: string[];
    constraints: string[];
    failedAttempts: string[];
  };
}

export type IngestionItemAction = "add" | "update" | "skip" | "conflict" | "reject";

export interface IngestionChangeRecord {
  id?: string;
  type: "project" | "task" | "decision" | "issue" | "file" | "constraint" | "attempt";
  action: IngestionItemAction;
  summary: string;
  reason?: string;
}

export interface IngestionPreview {
  valid: boolean;
  format: string;
  version: string;
  stateHashBefore: string;
  summary: {
    totalItems: number;
    toAdd: number;
    toUpdate: number;
    toSkip: number;
    conflicts: number;
    rejected: number;
  };
  changes: IngestionChangeRecord[];
  securityAlerts: string[];
}