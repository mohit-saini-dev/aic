import fs from "node:fs";
import path from "node:path";
import type { ExecutionResult } from "./types.js";

export type VerificationStatus = "passed" | "failed" | "inconclusive";

export interface VerificationCheck {
  name: string;
  passed: boolean | null;
  evidence?: string;
}

export interface VerificationResult {
  status: VerificationStatus;
  exitCode: number | null;
  timedOut: boolean;
  cancelled: boolean;
  durationMs: number;
  changedPaths: string[];
  checks: VerificationCheck[];
  errors: string[];
}

export interface VerificationOptions {
  requiredFiles?: string[];
  expectedExitCode?: number;
}

export function verifyOutcome(
  result: ExecutionResult,
  projectRoot: string,
  options: VerificationOptions = {}
): VerificationResult {
  const errors: string[] = [];
  const checks: VerificationCheck[] = [];
  const expectedCode = options.expectedExitCode ?? 0;

  const timedOut = result.stderr.includes("timed out");
  const cancelled = result.stderr.includes("cancelled");
  const exitCodeMatches = result.exitCode === expectedCode;

  checks.push({
    name: "ExitCodeCheck",
    passed: exitCodeMatches,
    evidence: `Process exited with code ${result.exitCode} (expected ${expectedCode})`
  });

  if (!exitCodeMatches) {
    errors.push(`Exit code mismatch: got ${result.exitCode}, expected ${expectedCode}`);
  }

  if (options.requiredFiles && options.requiredFiles.length > 0) {
    for (const file of options.requiredFiles) {
      const absPath = path.resolve(projectRoot, file);
      const exists = fs.existsSync(absPath);
      checks.push({
        name: `FileExists:${file}`,
        passed: exists,
        evidence: exists ? `File found at ${absPath}` : `Required file missing: ${absPath}`
      });
      if (!exists) {
        errors.push(`Required file not found: ${file}`);
      }
    }
  }

  let status: VerificationStatus = "passed";
  if (timedOut || cancelled || errors.length > 0 || result.verificationStatus === "FAILED") {
    status = timedOut || cancelled ? "inconclusive" : "failed";
  }

  let durationMs = 0;
  try {
    const start = new Date(result.startedAt).getTime();
    const finish = new Date(result.finishedAt).getTime();
    if (!isNaN(start) && !isNaN(finish)) {
      durationMs = finish - start;
    }
  } catch {
    durationMs = 0;
  }

  return {
    status,
    exitCode: result.exitCode,
    timedOut,
    cancelled,
    durationMs,
    changedPaths: result.changedFiles || [],
    checks,
    errors
  };
}