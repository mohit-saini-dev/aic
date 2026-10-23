import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import type { ExecutionProposal, ApprovalDecision, ExecutionResult } from "./types.js";
import type { ExecutionPolicy } from "./policy.js";
import { DEFAULT_EXECUTION_POLICY } from "./policy.js";
import { validateApprovalBinding } from "./validation.js";

export interface ExecutionOptions {
  timeoutMs?: number;
  maxOutputBytes?: number;
  environmentAllowlist?: string[];
}

const DEFAULT_OPTIONS = {
  timeoutMs: 30000, // 30 seconds default timeout
  maxOutputBytes: 1024 * 1024, // 1 MB output limit
  environmentAllowlist: [
    "PATH",
    "NODE_ENV",
    "SystemRoot", // Windows compatibility
    "WINDIR",     // Windows compatibility
    "HOME",       // POSIX compatibility
    "USER",       // POSIX compatibility
    "LANG",
    "LC_ALL"
  ]
};

/**
 * Sanitizes environment variables to prevent secret leakage from host process.env.
 */
function sanitizeEnvironment(allowlist: string[]): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const key of allowlist) {
    const val = process.env[key];
    if (typeof val === "string") {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

/**
 * Validates and canonicalizes the working directory.
 * Rejects paths whose real filesystem location escapes projectRoot.
 */
export function validateWorkingDirectory(
  projectRoot: string,
  workingDirectory: string
): { valid: boolean; resolvedPath?: string; reason?: string } {
  try {
    const absRoot = path.resolve(projectRoot);
    if (!fs.existsSync(absRoot)) {
      return { valid: false, reason: `Project root does not exist: ${absRoot}` };
    }
    const realRoot = fs.realpathSync(absRoot);

    // Resolve candidate path against the real root
    const candidate = path.resolve(realRoot, workingDirectory);

    // Lexically check containment first so traversal attempts are caught immediately
    const relativeBefore = path.relative(realRoot, candidate);
    const isOutsideBefore =
      relativeBefore === ".." ||
      relativeBefore.startsWith(`..${path.sep}`) ||
      relativeBefore.startsWith("..\\") ||
      relativeBefore.startsWith("../") ||
      path.isAbsolute(relativeBefore);

    if (isOutsideBefore) {
      return {
        valid: false,
        reason: `Working directory escapes project root boundary: ${candidate}`
      };
    }

    if (!fs.existsSync(candidate)) {
      return {
        valid: false,
        reason: `Working directory does not exist or is not accessible: ${candidate}`
      };
    }

    // realpathSync resolves directory symlinks to their actual targets
    const realTarget = fs.realpathSync(candidate);
    const relative = path.relative(realRoot, realTarget);
    const isOutside =
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      relative.startsWith("..\\") ||
      relative.startsWith("../") ||
      path.isAbsolute(relative);

    if (isOutside) {
      return {
        valid: false,
        reason: `Working directory escapes project root boundary: ${realTarget}`
      };
    }

    if (!fs.statSync(realTarget).isDirectory()) {
      return {
        valid: false,
        reason: `Working directory is not a directory: ${realTarget}`
      };
    }

    return { valid: true, resolvedPath: realTarget };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return {
      valid: false,
      reason: `Failed to resolve or access working directory: ${message}`
    };
  }
}

/**
 * Executes a validated and approved proposal under strict security, environment isolation, and resource constraints.
 */
export async function executeProposal(
  proposal: ExecutionProposal,
  decision: ApprovalDecision,
  projectRoot: string,
  policy: ExecutionPolicy = DEFAULT_EXECUTION_POLICY,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  const opts = {
    timeoutMs: options.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs,
    maxOutputBytes: options.maxOutputBytes ?? DEFAULT_OPTIONS.maxOutputBytes,
    environmentAllowlist: options.environmentAllowlist ?? DEFAULT_OPTIONS.environmentAllowlist
  };
  const startedAt = new Date().toISOString();

  // 1. Revalidate approval binding
  const bindingCheck = validateApprovalBinding(proposal, decision, projectRoot, policy);
  if (!bindingCheck.valid) {
    return {
      proposalId: proposal.proposalId,
      approvalId: decision.approvalId,
      exitCode: null,
      stdout: "",
      stderr: `Execution blocked: ${bindingCheck.reason}`,
      startedAt,
      finishedAt: new Date().toISOString(),
      changedFiles: [],
      diffSummary: "",
      verificationStatus: "FAILED"
    };
  }

  // 2. Validate and canonicalize working directory (prevent traversal/symlink escape)
  const dirCheck = validateWorkingDirectory(projectRoot, proposal.workingDirectory);
  if (!dirCheck.valid || !dirCheck.resolvedPath) {
    return {
      proposalId: proposal.proposalId,
      approvalId: decision.approvalId,
      exitCode: null,
      stdout: "",
      stderr: `Execution blocked: ${dirCheck.reason}`,
      startedAt,
      finishedAt: new Date().toISOString(),
      changedFiles: [],
      diffSummary: "",
      verificationStatus: "FAILED"
    };
  }

  const resolvedWorkingDir = dirCheck.resolvedPath;
  const sanitizedEnv = sanitizeEnvironment(opts.environmentAllowlist);

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let killed = false;

    // Spawn process safely with shell: false and sanitized environment
    const child = spawn(proposal.executable, proposal.arguments, {
      cwd: resolvedWorkingDir,
      shell: false,
      env: sanitizedEnv
    });

    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
    }, opts.timeoutMs);

    child.stdout.on("data", (data) => {
      if (stdout.length < opts.maxOutputBytes) {
        stdout += data.toString();
      }
    });

    child.stderr.on("data", (data) => {
      if (stderr.length < opts.maxOutputBytes) {
        stderr += data.toString();
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        proposalId: proposal.proposalId,
        approvalId: decision.approvalId,
        exitCode: null,
        stdout,
        stderr: `${stderr}\nProcess error: ${err.message}`,
        startedAt,
        finishedAt: new Date().toISOString(),
        changedFiles: [],
        diffSummary: "",
        verificationStatus: "FAILED"
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const finishedAt = new Date().toISOString();

      if (killed) {
        resolve({
          proposalId: proposal.proposalId,
          approvalId: decision.approvalId,
          exitCode: code,
          stdout,
          stderr: `${stderr}\nExecution timed out after ${opts.timeoutMs}ms`,
          startedAt,
          finishedAt,
          changedFiles: [],
          diffSummary: "",
          verificationStatus: "FAILED"
        });
        return;
      }

      resolve({
        proposalId: proposal.proposalId,
        approvalId: decision.approvalId,
        exitCode: code,
        stdout,
        stderr,
        startedAt,
        finishedAt,
        changedFiles: [],
        diffSummary: "",
        verificationStatus: code === 0 ? "PASSED" : "FAILED"
      });
    });
  });
}