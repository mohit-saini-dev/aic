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
  deleteMemory
} from "@aic/core";

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

function printHelp(): void {
  console.log(`
AIC — Context Management CLI

Usage:
  aic init [--name <name>] [--objective <objective>]
  aic status
  aic snapshot
  aic context
  aic export [output-file]           Export project context to JSON
  aic inspect <context-package-file> Validate and summarize a context package
  aic import <context-package-file>  Import context into an empty AIC project
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
  console.log(`Current task: ${state.currentTask ?? "(none)"}`);
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