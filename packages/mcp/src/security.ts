import * as path from "node:path";
import * as fs from "node:fs";

export function validateProjectRoot(targetRoot?: string): string {
  const resolved = path.resolve(targetRoot ?? process.cwd());

  if (!fs.existsSync(resolved)) {
    throw new Error(`Project root does not exist: ${resolved}`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Project root is not a directory: ${resolved}`);
  }

  // Ensure .aic directory exists or project is initialized
  const aicDir = path.join(resolved, ".aic");
  if (!fs.existsSync(aicDir)) {
    throw new Error(`AIC is not initialized in project root: ${resolved}`);
  }

  return resolved;
}