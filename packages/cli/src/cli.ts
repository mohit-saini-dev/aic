#!/usr/bin/env node

import {
  initProject,
  getStatus,
  createSnapshot,
  readState,
  exportContextPackage,
  inspectContextPackage,
  importContextPackage,
  createMemory,
  getMemory,
  listMemories,
  updateMemory,
  archiveMemory,
  deleteMemory,
  updateProjectDetails,
  setCurrentTask,
  clearCurrentTask,
  addDecision,
  addIssue,
  addRelevantFile,
  removeRelevantFile,
  addConstraint,
  addFailedAttempt
} from "@aic/core";

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ProjectStatus, TaskStatus } from "@aic/protocol";

function printHelp(): void {
  console.log(`
AIC — Context Management CLI

Usage:
  aic init [--name <name>] [--objective <objective>]
  aic status
  aic snapshot
  aic context
  aic export [output-file]                  Export project context to JSON
  aic inspect <context-package-file> Validate and summarize a context package
  aic import <context-package-file>   Import context into an empty AIC project
  aic project set [--name <name>] [--objective <objective>] [--status <status>]
  aic task set <title> [--status <status>]
  aic task clear
  aic decision add <title> --decision <text> [--reason <text>]
  aic issue add <title> --description <text> [--status <status>]
  aic file add <path>
  aic file remove <path>
  aic constraint add <text>
  aic attempt add <text>
  aic memory add <content> [--category <cat>] [--expires <date>]
  aic memory list [--category <cat>] [--status <status>]
  aic memory show <id>
  aic memory edit <id> [--content <text>] [--category <cat>] [--status <status>]
  aic memory archive <id>
  aic memory delete <id>
  aic help
`);
}

function runInit(args: string[]): void {
  let name: string | undefined;
  let objective: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && args[i + 1]) {
      name = args[i + 1];
      i++;
    } else if (args[i] === "--objective" && args[i + 1]) {
      objective = args[i + 1];
      i++;
    }
  }

  const state = initProject(process.cwd(), { name, objective });
  console.log("AIC initialized successfully.");
  console.log(`Project: ${state.project.name}`);
  console.log(`Objective: ${state.project.objective}`);
}

function runStatus(): void {
  const status = getStatus(process.cwd());

  if (!status.initialized) {
    console.log("AIC is not initialized in this directory.");
    return;
  }

  const state = readState(process.cwd());
  console.log(`Project: ${state.project.name}`);
  console.log(`Objective: ${state.project.objective}`);
  console.log(`Current task: ${state.currentTask ? state.currentTask.title + " (" + state.currentTask.status + ")" : "(none)"}`);
  console.log(`Decisions: ${state.decisions.length}`);
  console.log(`Issues: ${state.issues.length}`);
  console.log(`Relevant files: ${state.relevantFiles.length}`);
}

function runSnapshot(): void {
  const snapshotPath = createSnapshot(process.cwd());
  console.log(`Snapshot created at: ${snapshotPath}`);
}

function runContext(): void {
  const state = readState(process.cwd());
  console.log(JSON.stringify(state, null, 2));
}

function runExport(args: string[]): void {
  const outputFile = args[0] ?? "handoff.aic.json";

  if (args.length > 1) {
    throw new Error(
      "Usage: aic export [output-file]"
    );
  }

  const outputPath = exportContextPackage(
    process.cwd(),
    outputFile
  );

  console.log("AIC context package exported successfully.");
  console.log(`File: ${outputPath}`);
}

function runInspect(args: string[]): void {
  if (args.length !== 1) {
    throw new Error(
      "Usage: aic inspect <context-package-file>"
    );
  }

  const contextPackage = inspectContextPackage(args[0]);

  console.log("AIC context package is valid.");
  console.log(`Project: ${contextPackage.context.project.name}`);
  console.log(`Objective: ${contextPackage.context.project.objective}`);
  console.log(`Created: ${contextPackage.createdAt}`);
  console.log(`Decisions: ${contextPackage.context.decisions.length}`);
  console.log(`Issues: ${contextPackage.context.issues.length}`);
  console.log(`Relevant files: ${contextPackage.context.relevantFiles.length}`);
}

function runImport(args: string[]): void {
  if (args.length !== 1) {
    throw new Error(
      "Usage: aic import <context-package-file>"
    );
  }

  const statePath = importContextPackage(
    args[0],
    process.cwd()
  );

  console.log("AIC context package imported successfully.");
  console.log(`State: ${statePath}`);
}

function runProject(args: string[]): void {
  const subcommand = args[0];
  const subArgs = args.slice(1);
  const root = process.cwd();

  if (subcommand !== "set") {
    throw new Error("Usage: aic project set [--name <name>] [--objective <obj>] [--status <status>]");
  }

  let name: string | undefined;
  let objective: string | undefined;
  let status: ProjectStatus | undefined;

  for (let i = 0; i < subArgs.length; i++) {
    if (subArgs[i] === "--name" && subArgs[i + 1]) {
      name = subArgs[i + 1];
      i++;
    } else if (subArgs[i] === "--objective" && subArgs[i + 1]) {
      objective = subArgs[i + 1];
      i++;
    } else if (subArgs[i] === "--status" && subArgs[i + 1]) {
      status = subArgs[i + 1] as ProjectStatus;
      i++;
    }
  }

  const updated = updateProjectDetails(root, { name, objective, status });
  console.log("Project details updated successfully.");
  console.log(`Project: ${updated.project.name}`);
  console.log(`Objective: ${updated.project.objective}`);
  console.log(`Status: ${updated.project.status}`);
}

function runTask(args: string[]): void {
  const subcommand = args[0];
  const subArgs = args.slice(1);
  const root = process.cwd();

  if (subcommand === "set") {
    let title: string | undefined;
    let status: TaskStatus = "in_progress";

    for (let i = 0; i < subArgs.length; i++) {
      if (subArgs[i] === "--status" && subArgs[i + 1]) {
        status = subArgs[i + 1] as TaskStatus;
        i++;
      } else if (!title && !subArgs[i].startsWith("-")) {
        title = subArgs[i];
      }
    }

    if (!title) {
      throw new Error("Usage: aic task set <title> [--status <status>]");
    }

    const updated = setCurrentTask(root, { title, status });
    console.log("Current task set successfully.");
    console.log(`Task: ${updated.currentTask?.title} (${updated.currentTask?.status})`);
  } else if (subcommand === "clear") {
    const updated = clearCurrentTask(root);
    console.log("Current task cleared.");
  } else {
    throw new Error("Usage: aic task set <title> [--status <status>] OR aic task clear");
  }
}

function runDecision(args: string[]): void {
  const subcommand = args[0];
  const subArgs = args.slice(1);
  const root = process.cwd();

  if (subcommand !== "add") {
    throw new Error("Usage: aic decision add <title> --decision <text> [--reason <text>]");
  }

  let title: string | undefined;
  let decisionText: string | undefined;
  let reason: string | undefined;

  for (let i = 0; i < subArgs.length; i++) {
    if (subArgs[i] === "--decision" && subArgs[i + 1]) {
      decisionText = subArgs[i + 1];
      i++;
    } else if (subArgs[i] === "--reason" && subArgs[i + 1]) {
      reason = subArgs[i + 1];
      i++;
    } else if (!title && !subArgs[i].startsWith("-")) {
      title = subArgs[i];
    }
  }

  if (!title || !decisionText) {
    throw new Error("Usage: aic decision add <title> --decision <text> [--reason <text>]");
  }

  const updated = addDecision(root, { title, decision: decisionText, reason });
  console.log("Decision recorded successfully.");
  console.log(`Total decisions: ${updated.decisions.length}`);
}

function runIssue(args: string[]): void {
  const subcommand = args[0];
  const subArgs = args.slice(1);
  const root = process.cwd();

  if (subcommand !== "add") {
    throw new Error("Usage: aic issue add <title> --description <text> [--status <status>]");
  }

  let title: string | undefined;
  let description: string | undefined;
  let status: "open" | "resolved" = "open";

  for (let i = 0; i < subArgs.length; i++) {
    if (subArgs[i] === "--description" && subArgs[i + 1]) {
      description = subArgs[i + 1];
      i++;
    } else if (subArgs[i] === "--status" && subArgs[i + 1]) {
      status = subArgs[i + 1] as "open" | "resolved";
      i++;
    } else if (!title && !subArgs[i].startsWith("-")) {
      title = subArgs[i];
    }
  }

  if (!title || !description) {
    throw new Error("Usage: aic issue add <title> --description <text> [--status <status>]");
  }

  const updated = addIssue(root, { title, description, status });
  console.log("Issue tracked successfully.");
  console.log(`Total issues: ${updated.issues.length}`);
}

function runFile(args: string[]): void {
  const subcommand = args[0];
  const filePath = args[1];
  const root = process.cwd();

  if (!filePath) {
    throw new Error("Usage: aic file add <path> OR aic file remove <path>");
  }

  if (subcommand === "add") {
    const updated = addRelevantFile(root, filePath);
    console.log(`Relevant file added: ${filePath}`);
    console.log(`Total relevant files: ${updated.relevantFiles.length}`);
  } else if (subcommand === "remove") {
    const updated = removeRelevantFile(root, filePath);
    console.log(`Relevant file removed: ${filePath}`);
    console.log(`Total relevant files: ${updated.relevantFiles.length}`);
  } else {
    throw new Error("Usage: aic file add <path> OR aic file remove <path>");
  }
}

function runConstraint(args: string[]): void {
  const subcommand = args[0];
  const constraintText = args[1];
  const root = process.cwd();

  if (subcommand !== "add" || !constraintText) {
    throw new Error("Usage: aic constraint add <text>");
  }

  const updated = addConstraint(root, constraintText);
  console.log("Constraint added successfully.");
  console.log(`Total constraints: ${updated.constraints.length}`);
}

function runAttempt(args: string[]): void {
  const subcommand = args[0];
  const attemptText = args[1];
  const root = process.cwd();

  if (subcommand !== "add" || !attemptText) {
    throw new Error("Usage: aic attempt add <text>");
  }

  const updated = addFailedAttempt(root, attemptText);
  console.log("Failed attempt recorded successfully.");
  console.log(`Total failed attempts: ${updated.failedAttempts.length}`);
}

async function runMemory(args: string[]): Promise<void> {
  const subcommand = args[0];
  const subArgs = args.slice(1);
  const root = process.cwd();

  switch (subcommand) {
    case "add": {
      let content: string | undefined;
      let category = "user_fact";
      let expiresAt: string | null = null;

      for (let i = 0; i < subArgs.length; i++) {
        if (subArgs[i] === "--category" && subArgs[i + 1]) {
          category = subArgs[i + 1];
          i++;
        } else if (subArgs[i] === "--expires" && subArgs[i + 1]) {
          expiresAt = subArgs[i + 1];
          i++;
        } else if (!content && !subArgs[i].startsWith("-")) {
          content = subArgs[i];
        }
      }

      if (!content) {
        throw new Error("Usage: aic memory add <content> [--category <cat>] [--expires <date>]");
      }

      const memory = await createMemory(root, { category, content, expiresAt });
      console.log("Memory created successfully.");
      console.log(`ID: ${memory.id}`);
      console.log(`Category: ${memory.category}`);
      console.log(`Content: ${memory.content}`);
      break;
    }
    case "list": {
      let category: string | undefined;
      let status: string | undefined;

      for (let i = 0; i < subArgs.length; i++) {
        if (subArgs[i] === "--category" && subArgs[i + 1]) {
          category = subArgs[i + 1];
          i++;
        } else if (subArgs[i] === "--status" && subArgs[i + 1]) {
          status = subArgs[i + 1];
          i++;
        }
      }

      const memories = await listMemories(root, { category, status });
      if (memories.length === 0) {
        console.log("No memories found.");
        return;
      }

      console.log(`Found ${memories.length} memories:`);
      for (const m of memories) {
        console.log(`- [${m.id}] (${m.category} / ${m.status}) ${m.content}`);
      }
      break;
    }
    case "show": {
      const id = subArgs[0];
      if (!id) {
        throw new Error("Usage: aic memory show <id>");
      }

      const memory = await getMemory(root, id);
      if (!memory) {
        console.log(`Memory with ID "${id}" not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(JSON.stringify(memory, null, 2));
      break;
    }
    case "edit": {
      const id = subArgs[0];
      if (!id) {
        throw new Error("Usage: aic memory edit <id> [--content <text>] [--category <cat>] [--status <status>]");
      }

      let content: string | undefined;
      let category: string | undefined;
      let status: string | undefined;
      let expiresAt: string | null | undefined = undefined;

      for (let i = 1; i < subArgs.length; i++) {
        if (subArgs[i] === "--content" && subArgs[i + 1]) {
          content = subArgs[i + 1];
          i++;
        } else if (subArgs[i] === "--category" && subArgs[i + 1]) {
          category = subArgs[i + 1];
          i++;
        } else if (subArgs[i] === "--status" && subArgs[i + 1]) {
          status = subArgs[i + 1];
          i++;
        } else if (subArgs[i] === "--expires" && subArgs[i + 1]) {
          expiresAt = subArgs[i + 1];
          i++;
        }
      }

      const updated = await updateMemory(root, id, { content, category, status, expiresAt });
      console.log("Memory updated successfully.");
      console.log(JSON.stringify(updated, null, 2));
      break;
    }
    case "archive": {
      const id = subArgs[0];
      if (!id) {
        throw new Error("Usage: aic memory archive <id>");
      }

      const archived = await archiveMemory(root, id);
      console.log(`Memory ${archived.id} archived successfully.`);
      break;
    }
    case "delete": {
      const id = subArgs[0];
      if (!id) {
        throw new Error("Usage: aic memory delete <id>");
      }

      const rl = readline.createInterface({ input, output });
      const answer = await rl.question(`Are you sure you want to permanently delete memory ${id}? (y/N): `);
      rl.close();

      if (answer.trim().toLowerCase() !== "y") {
        console.log("Deletion cancelled.");
        return;
      }

      const success = await deleteMemory(root, id);
      if (success) {
        console.log("Memory permanently deleted.");
      } else {
        console.log(`Memory with ID "${id}" not found.`);
        process.exitCode = 1;
      }
      break;
    }
    default:
      console.error(`Unknown memory subcommand: ${subcommand}`);
      printHelp();
      process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case "init":
        runInit(args.slice(1));
        break;
      case "status":
        runStatus();
        break;
      case "snapshot":
        runSnapshot();
        break;
      case "context":
        runContext();
        break;
      case "export":
        runExport(args.slice(1));
        break;
      case "inspect":
        runInspect(args.slice(1));
        break;
      case "import":
        runImport(args.slice(1));
        break;
      case "project":
        runProject(args.slice(1));
        break;
      case "task":
        runTask(args.slice(1));
        break;
      case "decision":
        runDecision(args.slice(1));
        break;
      case "issue":
        runIssue(args.slice(1));
        break;
      case "file":
        runFile(args.slice(1));
        break;
      case "constraint":
        runConstraint(args.slice(1));
        break;
      case "attempt":
        runAttempt(args.slice(1));
        break;
      case "memory":
        await runMemory(args.slice(1));
        break;
      case "help":
      case "--help":
      case "-h":
      case undefined:
        printHelp();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();