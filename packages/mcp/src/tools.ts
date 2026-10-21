import { readState, compileContext } from "@aic/core";
import { validateProjectRoot } from "./security.js";

export function getProjectSummaryTool(projectRoot?: string) {
  const root = validateProjectRoot(projectRoot);
  const state = readState(root);
  return {
    project: state.project,
    version: state.version,
    updatedAt: state.updatedAt
  };
}

export function getCurrentTaskTool(projectRoot?: string) {
  const root = validateProjectRoot(projectRoot);
  const state = readState(root);
  return {
    currentTask: state.currentTask
  };
}

export function listDecisionsTool(projectRoot?: string) {
  const root = validateProjectRoot(projectRoot);
  const state = readState(root);
  return {
    decisions: state.decisions
  };
}

export function listIssuesTool(projectRoot?: string) {
  const root = validateProjectRoot(projectRoot);
  const state = readState(root);
  return {
    issues: state.issues
  };
}

export function getConstraintsTool(projectRoot?: string) {
  const root = validateProjectRoot(projectRoot);
  const state = readState(root);
  return {
    constraints: state.constraints
  };
}

export function getRelevantFilesTool(projectRoot?: string) {
  const root = validateProjectRoot(projectRoot);
  const state = readState(root);
  return {
    relevantFiles: state.relevantFiles
  };
}

export async function compileContextTool(projectRoot?: string, maxCharacters?: number) {
  const root = validateProjectRoot(projectRoot);
  return await compileContext(root, { maxCharacters });
}