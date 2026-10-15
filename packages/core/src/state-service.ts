import * as fs from "node:fs";
import type { 
  AicWorkState, 
  ProjectStatus, 
  TaskStatus, 
  AicTask, 
  AicDecision, 
  AicIssue 
} from "@aic/protocol";
import { readState, getStateFilePath } from "./index.js";
import { assertValidWorkState } from "./validation.js";

function saveState(root: string, state: AicWorkState): AicWorkState {
  state.updatedAt = new Date().toISOString();
  assertValidWorkState(state);
  fs.writeFileSync(
    getStateFilePath(root),
    JSON.stringify(state, null, 2) + "\n",
    "utf8"
  );
  return state;
}

export function updateProjectDetails(
  root: string, 
  updates: { name?: string; objective?: string; status?: ProjectStatus }
): AicWorkState {
  const state = readState(root);
  if (updates.name !== undefined) state.project.name = updates.name;
  if (updates.objective !== undefined) state.project.objective = updates.objective;
  if (updates.status !== undefined) state.project.status = updates.status;
  return saveState(root, state);
}

export function setCurrentTask(
  root: string, 
  task: { id?: string; title: string; status?: TaskStatus }
): AicWorkState {
  const state = readState(root);
  const newTask: AicTask = {
    id: task.id || crypto.randomUUID(),
    title: task.title,
    status: task.status || "in_progress"
  };
  state.currentTask = newTask;
  return saveState(root, state);
}

export function clearCurrentTask(root: string): AicWorkState {
  const state = readState(root);
  state.currentTask = null;
  return saveState(root, state);
}

export function addDecision(
  root: string, 
  decision: { id?: string; title: string; decision: string; reason?: string }
): AicWorkState {
  const state = readState(root);
  const newDecision: AicDecision = {
    id: decision.id || crypto.randomUUID(),
    title: decision.title,
    decision: decision.decision,
    reason: decision.reason
  };
  state.decisions.push(newDecision);
  return saveState(root, state);
}

export function addIssue(
  root: string, 
  issue: { id?: string; title: string; description: string; status?: "open" | "resolved" }
): AicWorkState {
  const state = readState(root);
  const newIssue: AicIssue = {
    id: issue.id || crypto.randomUUID(),
    title: issue.title,
    description: issue.description,
    status: issue.status || "open"
  };
  state.issues.push(newIssue);
  return saveState(root, state);
}

export function addRelevantFile(root: string, filePath: string): AicWorkState {
  const state = readState(root);
  if (!state.relevantFiles.includes(filePath)) {
    state.relevantFiles.push(filePath);
    return saveState(root, state);
  }
  return state;
}

export function removeRelevantFile(root: string, filePath: string): AicWorkState {
  const state = readState(root);
  state.relevantFiles = state.relevantFiles.filter((f) => f !== filePath);
  return saveState(root, state);
}

export function addConstraint(root: string, constraint: string): AicWorkState {
  const state = readState(root);
  if (!state.constraints.includes(constraint)) {
    state.constraints.push(constraint);
    return saveState(root, state);
  }
  return state;
}

export function addFailedAttempt(root: string, attempt: string): AicWorkState {
  const state = readState(root);
  if (!state.failedAttempts.includes(attempt)) {
    state.failedAttempts.push(attempt);
    return saveState(root, state);
  }
  return state;
}