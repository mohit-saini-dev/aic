import path from "node:path";
import { ExecutionProposal } from "./types.js";

export interface ExecutionPolicy {
  allowedExecutables: string[];
  maxArguments: number;
  disallowedArgumentPatterns: RegExp[];
  requireWithinProjectRoot: boolean;
}

export const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = {
  allowedExecutables: ["npm", "node", "npx"],
  maxArguments: 10,
  disallowedArgumentPatterns: [
    /;\s*rm\b/i,
    /&&\s*rm\b/i,
    /\|\s*sh\b/i,
    />\s*\/dev\/sd/i,
    /\bcurl\b.*\bhttp/i,
    /\bwget\b/i
  ],
  requireWithinProjectRoot: true
};

export interface PolicyValidationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validates an execution proposal against the security policy.
 */
export function validateProposalPolicy(
  proposal: ExecutionProposal,
  projectRoot: string,
  policy: ExecutionPolicy = DEFAULT_EXECUTION_POLICY
): PolicyValidationResult {
  // Rule 6: Default-deny operations that are not explicitly supported
  if (!proposal.executable || !policy.allowedExecutables.includes(proposal.executable)) {
    return {
      allowed: false,
      reason: `Executable '${proposal.executable}' is not permitted by policy.`
    };
  }

  // Check argument count limits
  if (proposal.arguments.length > policy.maxArguments) {
    return {
      allowed: false,
      reason: `Proposal exceeds maximum argument count (${proposal.arguments.length} > ${policy.maxArguments}).`
    };
  }

  // Check against dangerous argument patterns (command injection / shell chaining defense)
  const fullCommandString = [proposal.executable, ...proposal.arguments].join(" ");
  for (const pattern of policy.disallowedArgumentPatterns) {
    if (pattern.test(fullCommandString)) {
      return {
        allowed: false,
        reason: `Proposal contains disallowed argument pattern matching security blacklist.`
      };
    }
  }

  // Rule 3: Enforce working directory constraints (must be within or equal to projectRoot)
  if (policy.requireWithinProjectRoot) {
    const resolvedProjectRoot = path.resolve(projectRoot);
    const resolvedWorkingDir = path.resolve(proposal.workingDirectory);
    
    const relative = path.relative(resolvedProjectRoot, resolvedWorkingDir);
    if (relative.startsWith("..") && path.isAbsolute(relative)) {
      return {
        allowed: false,
        reason: `Working directory '${proposal.workingDirectory}' escapes project root.`
      };
    }
  }

  return { allowed: true };
}