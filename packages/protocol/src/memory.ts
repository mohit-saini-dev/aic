export const AIC_MEMORY_VERSION = "1.0";

export const MEMORY_CATEGORIES = [
  "preference",
  "user_fact",
  "goal",
  "working_style"
] as const;

export type MemoryCategory =
  (typeof MEMORY_CATEGORIES)[number];

export type MemorySource =
  | "user_provided"
  | "user_approved_inference";

export type MemoryStatus =
  | "active"
  | "archived";

export interface AicMemory {
  id: string;
  schemaVersion: string;
  category: MemoryCategory;
  content: string;
  source: MemorySource;
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface MemoryValidationResult {
  valid: boolean;
  errors: string[];
}

const isRecord = (
  value: unknown
): value is Record<string, unknown> => {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
};

const isNonEmptyString = (
  value: unknown
): value is string => {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
};

const isValidTimestamp = (
  value: unknown
): value is string => {
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
};

export function validateAicMemory(
  value: unknown
): MemoryValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      errors: ["Memory must be a JSON object."]
    };
  }

  if (!isNonEmptyString(value.id)) {
    errors.push("id must be a non-empty string.");
  }

  if (value.schemaVersion !== AIC_MEMORY_VERSION) {
    errors.push(
      `schemaVersion must be "${AIC_MEMORY_VERSION}".`
    );
  }

  if (
    typeof value.category !== "string" ||
    !MEMORY_CATEGORIES.includes(
      value.category as MemoryCategory
    )
  ) {
    errors.push("category is not supported.");
  }

  if (!isNonEmptyString(value.content)) {
    errors.push("content must be a non-empty string.");
  }

  if (
    value.source !== "user_provided" &&
    value.source !== "user_approved_inference"
  ) {
    errors.push("source is not supported.");
  }

  if (
    value.status !== "active" &&
    value.status !== "archived"
  ) {
    errors.push("status is not supported.");
  }

  if (!isValidTimestamp(value.createdAt)) {
    errors.push(
      "createdAt must be a valid timestamp with a timezone."
    );
  }

  if (!isValidTimestamp(value.updatedAt)) {
    errors.push(
      "updatedAt must be a valid timestamp with a timezone."
    );
  }

  if (
    value.expiresAt !== null &&
    !isValidTimestamp(value.expiresAt)
  ) {
    errors.push(
      "expiresAt must be null or a valid timestamp with a timezone."
    );
  }

  if (
    isValidTimestamp(value.createdAt) &&
    isValidTimestamp(value.updatedAt) &&
    Date.parse(value.updatedAt) < Date.parse(value.createdAt)
  ) {
    errors.push(
      "updatedAt cannot be earlier than createdAt."
    );
  }

  if (
    value.expiresAt !== null &&
    isValidTimestamp(value.expiresAt) &&
    isValidTimestamp(value.createdAt) &&
    Date.parse(value.expiresAt) <= Date.parse(value.createdAt)
  ) {
    errors.push(
      "expiresAt must be later than createdAt."
    );
  }

  return {
    valid: errors.length === 0,
    errors
  };
}