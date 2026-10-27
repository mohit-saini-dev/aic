
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

import type {
  ExecutionProposal,
  ApprovalDecision,
  ExecutionResult
} from "./types.js";

import {
  ExecutionPolicy,
  DEFAULT_EXECUTION_POLICY
} from "./policy.js";

import { validateApprovalBinding } from "./validation.js";

export interface ExecutionOptions {
  timeoutMs: number;
  maxOutputBytes: number;
  envAllowlist: string[];
}

const DEFAULT_EXECUTION_OPTIONS: ExecutionOptions = {
  timeoutMs: 30_000,
  maxOutputBytes: 1_000_000,
  envAllowlist: [
    "PATH",
    "NODE_ENV",
    "SystemRoot",
    "WINDIR",
    "HOME",
    "USER",
    "LANG",
    "LC_ALL"
  ]
};

const OUTPUT_LIMIT_WARNING =
  "[Output truncated: maximum output size reached.]";

export interface WorkingDirectoryValidation {
  valid: boolean;
  resolvedPath?: string;
  reason?: string;
}

/**
 * Signal the spawned process and, where supported, its descendants.
 *
 * POSIX: spawn in a dedicated process group and signal the group.
 * Windows: ask taskkill to target the process tree.
 *
 * Direct-child termination is retained as a fallback. Process-tree
 * termination is best-effort and should be verified on each target OS.
 */
function signalProcessTree(
  child: ChildProcess,
  signal: NodeJS.Signals
): void {
  const pid = child.pid;

  if (!pid) {
    try {
      child.kill(signal);
    } catch {
      // The process may already have exited.
    }
    return;
  }

  if (process.platform === "win32") {
    const args = [
      "/PID",
      String(pid),
      "/T",
      ...(signal === "SIGKILL" ? ["/F"] : [])
    ];

    let killer: ChildProcess;

    try {
      killer = spawn("taskkill", args, {
        windowsHide: true,
        stdio: "ignore"
      });
    } catch {
      try {
        child.kill(signal);
      } catch {
        // The process may already have exited.
      }
      return;
    }

    const fallback = (): void => {
      try {
        child.kill(signal);
      } catch {
        // The process may already have exited.
      }
    };

    killer.once("error", fallback);
    killer.once("close", (code) => {
      if (code !== 0) {
        fallback();
      }
    });

    return;
  }

  try {
    // The child is spawned detached on POSIX, making its PID the
    // process-group ID for this execution.
    process.kill(-pid, signal);
  } catch {
    // Fall back to signalling the direct child if group signalling fails.
    try {
      child.kill(signal);
    } catch {
      // The process may already have exited.
    }
  }
}

function isWithinDirectory(root: string, target: string): boolean {
  const relativePath = path.relative(root, target);

  return (
    relativePath === "" ||
    (
      relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath)
    )
  );
}

export function validateWorkingDirectory(
  projectRoot: string,
  workingDirectory: string
): WorkingDirectoryValidation {
  try {
    const resolvedRoot = path.resolve(projectRoot);

    const resolvedDirectory = path.isAbsolute(workingDirectory)
      ? path.resolve(workingDirectory)
      : path.resolve(resolvedRoot, workingDirectory);

    if (!fs.existsSync(resolvedRoot)) {
      return {
        valid: false,
        reason: "Project root does not exist."
      };
    }

    if (!fs.existsSync(resolvedDirectory)) {
      return {
        valid: false,
        reason: "Working directory does not exist."
      };
    }

    const realRoot = fs.realpathSync(resolvedRoot);
    const realDirectory = fs.realpathSync(resolvedDirectory);

    if (!isWithinDirectory(realRoot, realDirectory)) {
      return {
        valid: false,
        reason:
          "Working directory escapes project root boundary (resolved path)."
      };
    }

    if (!fs.statSync(realDirectory).isDirectory()) {
      return {
        valid: false,
        reason: "Working directory is not a directory."
      };
    }

    return {
      valid: true,
      resolvedPath: realDirectory
    };
  } catch (error) {
    return {
      valid: false,
      reason: `Working directory validation failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
}

function getSanitizedEnvironment(
  allowlist: string[]
): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = {};

  for (const key of allowlist) {
    const value = process.env[key];

    if (typeof value === "string") {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function createFailedResult(
  proposal: ExecutionProposal,
  decision: ApprovalDecision | null | undefined,
  message: string,
  startedAt: string
): ExecutionResult {
  return {
    proposalId: proposal.proposalId,
    approvalId:
      decision && typeof decision.approvalId === "string"
        ? decision.approvalId
        : "",
    exitCode: null,
    stdout: "",
    stderr: message,
    startedAt,
    finishedAt: new Date().toISOString(),
    changedFiles: [],
    diffSummary: "",
    verificationStatus: "FAILED"
  };
}

function validateExecutionOptions(
  options: ExecutionOptions
): string | undefined {
  if (
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs <= 0
  ) {
    return "Execution timeout must be a positive safe integer.";
  }

  if (
    !Number.isSafeInteger(options.maxOutputBytes) ||
    options.maxOutputBytes <= 0
  ) {
    return "Maximum output size must be a positive safe integer.";
  }

  if (
    !Array.isArray(options.envAllowlist) ||
    options.envAllowlist.some(
      (key) => typeof key !== "string" || key.trim().length === 0
    )
  ) {
    return "Environment allowlist is invalid.";
  }

  return undefined;
}

export async function executeProposal(
  proposal: ExecutionProposal,
  decision: ApprovalDecision,
  projectRoot: string,
  policy: ExecutionPolicy = DEFAULT_EXECUTION_POLICY,
  options: Partial<ExecutionOptions> = {}
): Promise<ExecutionResult> {
  const startedAt = new Date().toISOString();

  const opts: ExecutionOptions = {
    ...DEFAULT_EXECUTION_OPTIONS,
    ...options
  };

  const optionsError = validateExecutionOptions(opts);

  if (optionsError) {
    return createFailedResult(
      proposal,
      decision,
      `Execution blocked: ${optionsError}`,
      startedAt
    );
  }

  if (proposal.status !== "APPROVED") {
    return createFailedResult(
      proposal,
      decision,
      "Execution blocked: proposal status is not APPROVED.",
      startedAt
    );
  }

  const approvalValidation = validateApprovalBinding(
    proposal,
    decision,
    projectRoot,
    policy
  );

  if (!approvalValidation.valid) {
    return createFailedResult(
      proposal,
      decision,
      `Execution blocked: ${
        approvalValidation.reason ?? "Approval validation failed."
      }`,
      startedAt
    );
  }

  const directoryValidation = validateWorkingDirectory(
    projectRoot,
    proposal.workingDirectory
  );

  if (!directoryValidation.valid || !directoryValidation.resolvedPath) {
    return createFailedResult(
      proposal,
      decision,
      `Execution blocked: ${
        directoryValidation.reason ?? "Invalid working directory."
      }`,
      startedAt
    );
  }

  const cwd = directoryValidation.resolvedPath;
  const env = getSanitizedEnvironment(opts.envAllowlist);

  return new Promise<ExecutionResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let timedOut = false;
    let outputLimitReached = false;
    let settled = false;

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let terminationTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: ExecutionResult): void => {
      if (settled) {
        return;
      }

      settled = true;

      if (timeout) {
        clearTimeout(timeout);
      }

      if (terminationTimer) {
        clearTimeout(terminationTimer);
      }

      resolve(result);
    };

    const finishFailed = (exitCode: number | null): void => {
      finish({
        proposalId: proposal.proposalId,
        approvalId: decision.approvalId,
        exitCode,
        stdout,
        stderr,
        startedAt,
        finishedAt: new Date().toISOString(),
        changedFiles: [],
        diffSummary: "",
        verificationStatus: "FAILED"
      });
    };

    const appendDiagnostic = (message: string): void => {
      if (settled) {
        return;
      }

      const separator = stderr.length > 0 ? "\n" : "";
      const diagnostic = Buffer.from(`${separator}${message}`, "utf8");

      const remainingBytes = Math.max(
        0,
        opts.maxOutputBytes - outputBytes
      );

      const accepted = diagnostic.subarray(0, remainingBytes);

      if (accepted.length > 0) {
        stderr += accepted.toString("utf8");
        outputBytes += accepted.length;
      }
    };

    const forceTerminationAfterGrace = (
      child: ChildProcess
    ): void => {
      if (terminationTimer) {
        return;
      }

      terminationTimer = setTimeout(() => {
        if (settled) {
          return;
        }

        signalProcessTree(child, "SIGKILL");

        // Do not wait indefinitely if the child never emits "close".
        finishFailed(null);
      }, 1_000);

      terminationTimer.unref();
    };

    const terminate = (
      child: ChildProcess,
      reason: "timeout" | "output-limit"
    ): void => {
      if (settled || timedOut || outputLimitReached) {
        return;
      }

      if (reason === "timeout") {
        timedOut = true;
        appendDiagnostic(
          `Execution timed out after ${opts.timeoutMs} ms.`
        );
      } else {
        outputLimitReached = true;
        appendDiagnostic(OUTPUT_LIMIT_WARNING);
      }

      signalProcessTree(child, "SIGTERM");
      forceTerminationAfterGrace(child);
    };

    const warningBytes = Buffer.byteLength(
      `\n${OUTPUT_LIMIT_WARNING}`,
      "utf8"
    );

    const capturedOutputLimit = Math.max(
      0,
      opts.maxOutputBytes -
        Math.min(warningBytes, opts.maxOutputBytes)
    );

    let child: ChildProcess;

    try {
      child = spawn(
        proposal.executable,
        proposal.arguments,
        {
          cwd,
          shell: false,
          env,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          // On POSIX, create a separate process group so descendants
          // can be signalled without targeting unrelated processes.
          detached: process.platform !== "win32"
        }
      );
    } catch (error) {
      finish(
        createFailedResult(
          proposal,
          decision,
          `Execution failed to start: ${
            error instanceof Error ? error.message : String(error)
          }`,
          startedAt
        )
      );

      return;
    }

    const handleOutput = (
      chunk: Buffer | string,
      stream: "stdout" | "stderr"
    ): void => {
      if (settled || timedOut || outputLimitReached) {
        return;
      }

      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk);

      const remainingBytes = Math.max(
        0,
        capturedOutputLimit - outputBytes
      );

      const accepted = buffer.subarray(0, remainingBytes);

      if (accepted.length > 0) {
        const text = accepted.toString("utf8");

        if (stream === "stdout") {
          stdout += text;
        } else {
          stderr += text;
        }

        outputBytes += accepted.length;
      }

      if (buffer.length > accepted.length) {
        terminate(child, "output-limit");
      }
    };

    timeout = setTimeout(() => {
      terminate(child, "timeout");
    }, opts.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      handleOutput(chunk, "stdout");
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      handleOutput(chunk, "stderr");
    });

    child.on("error", (error: Error) => {
      if (timedOut || outputLimitReached) {
        return;
      }

      appendDiagnostic(error.message);
      finishFailed(null);
    });

    child.on("close", (code: number | null) => {
      if (timedOut || outputLimitReached) {
        finishFailed(code);
        return;
      }

      finish({
        proposalId: proposal.proposalId,
        approvalId: decision.approvalId,
        exitCode: code,
        stdout,
        stderr,
        startedAt,
        finishedAt: new Date().toISOString(),
        changedFiles: [],
        diffSummary: "",
        verificationStatus: code === 0 ? "PASSED" : "FAILED"
      });
    });
  });
}
