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
