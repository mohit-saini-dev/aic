#!/usr/bin/env node

import {
  initProject,
  getStatus,
  createSnapshot,
  readState,
  exportContextPackage,
  inspectContextPackage,
  importContextPackage
} from "@aic/core";

function printHelp(): void {
  console.log(`
AIC — Context Management CLI

Usage:
  aic init [--name <name>] [--objective <objective>]
  aic status
  aic snapshot
  aic context
  aic export [output-file]          Export project context to JSON
  aic inspect <context-package-file> Validate and summarize a context package
  aic import <context-package-file>  Import context into an empty AIC project
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

function main(): void {
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
