import type { AicWorkState } from "@aic/protocol";

function isObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  );
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !Number.isNaN(Date.parse(value)) &&
    /^\d{4}-\d{2}-\d{2}T/.test(value)
  );
}

export function validateWorkState(
  value: unknown
): value is AicWorkState {
  if (!isObject(value)) return false;

  if (typeof value.version !== "string") return false;
  if (!isObject(value.project)) return false;

  const project = value.project;

  if (typeof project.name !== "string") return false;
  if (typeof project.objective !== "string") return false;

  if (
    !["planned", "in_progress", "blocked", "completed"].includes(
      String(project.status)
    )
  ) {
    return false;
  }

  if (value.currentTask !== null) {
    if (!isObject(value.currentTask)) return false;

    const task = value.currentTask;

    if (typeof task.id !== "string") return false;
    if (typeof task.title !== "string") return false;

    if (
      !["todo", "in_progress", "blocked", "completed"].includes(
        String(task.status)
      )
    ) {
      return false;
    }
  }

  if (!Array.isArray(value.decisions)) return false;

  for (const item of value.decisions) {
    if (!isObject(item)) return false;
    if (typeof item.id !== "string") return false;
    if (typeof item.title !== "string") return false;
    if (typeof item.decision !== "string") return false;

    if (
      item.reason !== undefined &&
      typeof item.reason !== "string"
    ) {
      return false;
    }
  }

  if (!Array.isArray(value.issues)) return false;

  for (const item of value.issues) {
    if (!isObject(item)) return false;
    if (typeof item.id !== "string") return false;
    if (typeof item.title !== "string") return false;
    if (typeof item.description !== "string") return false;

    if (!["open", "resolved"].includes(String(item.status))) {
      return false;
    }
  }

  if (!isStringArray(value.relevantFiles)) return false;
  if (!isStringArray(value.constraints)) return false;
  if (!isStringArray(value.failedAttempts)) return false;

  if (!isIsoDate(value.createdAt)) return false;
  if (!isIsoDate(value.updatedAt)) return false;

  return true;
}

export function assertValidWorkState(
  value: unknown
): asserts value is AicWorkState {
  if (!validateWorkState(value)) {
    throw new Error(
      "AIC state validation failed: the file does not match the expected Work State structure."
    );
  }
}
