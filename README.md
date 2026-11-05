# AIC — AI Continuity Layer

**A local-first, provider-neutral continuity layer for AI-assisted development.**

AIC helps developers preserve, organize, validate, and transfer project context across AI-assisted development workflows. It provides a structured way to maintain project state, compile task-specific context, manage decisions and constraints, and create portable context packages.

The goal is simple: **your project context should remain yours, independent of the AI tool you use.**

## Why AIC?

AI-assisted development often involves switching between tools, models, accounts, or development environments. Important project information can become fragmented across conversations, making it difficult to continue work consistently.

AIC addresses this problem by maintaining structured project context outside individual AI conversations.

Instead of relying entirely on chat history, developers can manage reusable project information locally and selectively provide it to compatible AI workflows.

## Core Capabilities

### 1. Project Context Management
- Initialize and maintain structured project state.
- Track the current task and its status.
- Record architectural decisions and their reasoning.
- Track issues, constraints, relevant files, and failed attempts.
- Create project snapshots.

### 2. Context Compilation
- Compile project information into task-specific assistant context.
- Support configurable context character limits.
- Optionally include personal memories.
- Save compiled context to a file.
- Produce deterministic, portable context output.

### 3. Context Portability
- Export project context into portable JSON packages.
- Inspect and validate incoming context packages.
- Import context into an empty AIC project.
- Preview incoming context before applying changes.
- Detect conflicts, duplicates, and security alerts during ingestion.

### 4. Private Memory Management
- Store user-managed memories separately from project state.
- Organize memories by category.
- Create, list, inspect, edit, archive, and delete memories.
- Support optional expiration dates.
- Keep personal memories excluded from exported project context packages.

### 5. Controlled Execution Proposals
- Store and inspect execution proposals.
- Review and explicitly approve or reject proposals.
- Bind approval to proposal fingerprints.
- Maintain workflow and audit-related components in the bridge package.

### 6. Read-Only MCP Integration
- Provide an integration layer using the Model Context Protocol (MCP).
- Expose project context through read-only tools and resources.
- Keep project-root access constrained.
- Keep personal memories private by default.

## Architecture

AIC is organized as a TypeScript monorepo using npm workspaces.

| Package | Responsibility |
|---|---|
| `@aic/protocol` | Shared schemas, types, and protocol definitions |
| `@aic/core` | Project state, snapshots, memory, context compilation, and context packages |
| `@aic/bridge` | Proposal validation, approvals, workflow, audit, and controlled execution components |
| `@aic/cli` | Command-line interface for AIC |
| `@aic/mcp` | MCP server and read-only project context integration |

The repository also contains a separate `packages/mcp-server/` directory for ongoing work.

## Technology Stack

- **Language:** TypeScript
- **Runtime:** Node.js 22+
- **Package Management:** npm workspaces
- **Protocol Integration:** Model Context Protocol (MCP)
- **Validation:** Schema-based validation
- **Testing:** Node.js test runner
- **Build System:** TypeScript compiler

## Getting Started

### Prerequisites

- Node.js 22 or later
- npm

### Installation

Clone the repository:

```bash
git clone https://github.com/mohit-saini-dev/aic.git
cd aic
```

Install dependencies:

```bash
npm install
```

Build the project:

```bash
npm run build
```

Initialize AIC in a project directory:

```bash
node C:/path/to/aic/packages/cli/dist/cli.js init
```

Alternatively, run the CLI from the AIC repository root after building:

```bash
node ./packages/cli/dist/cli.js init
```

## CLI Commands

AIC provides the following command groups.

### Project and Context

```bash
aic init
aic status
aic snapshot
aic context
aic context compile
aic export
aic inspect <context-package-file>
aic import <context-package-file>
aic ingest <package-file>
```

Compile task-specific context with optional settings:

```bash
aic context compile --max-chars 12000 --out context.txt
```

Opt in to including personal memories:

```bash
aic context compile --include-memories
```

### Project State

```bash
aic project set --name "Project Name"
aic task set "Implement authentication"
aic task clear
aic decision add "Database choice" --decision "Use PostgreSQL"
aic issue add "Login failure" --description "Login request returns an error"
aic file add "src/index.ts"
aic file remove "src/index.ts"
aic constraint add "Maintain backward compatibility"
aic attempt add "Previous implementation failed due to..."
```

### Memory Management

```bash
aic memory add "Use TypeScript for this project"
aic memory list
aic memory show <id>
aic memory edit <id>
aic memory archive <id>
aic memory delete <id>
```

### Execution Proposals

```bash
aic proposals list
aic proposals show <proposalId>
aic proposals approve <proposalId>
aic proposals reject <proposalId>
```

Run `aic help` to view the complete CLI usage.

> **Note:** The `aic` executable is configured as the CLI package binary. The examples above use `aic` for readability; when running directly from the repository, use the built CLI entry point with Node.js.

## Development

Build all configured workspaces:

```bash
npm run build
```

Run TypeScript type checks:

```bash
npm run typecheck
```

Run tests across configured workspaces:

```bash
npm test
```

## Project Structure

```text
aic/
├── .aic/
│   ├── memory/
│   │   ├── memories.json
│   │   └── state.json
│   └── docs/
├── docs/
│   └── architecture.md
├── packages/
│   ├── bridge/
│   ├── cli/
│   ├── core/
│   ├── mcp/
│   ├── mcp-server/
│   └── protocol/
├── schemas/
├── LICENSE
├── README.md
├── package.json
├── package-lock.json
└── tsconfig.json
```

Generated build output and installed dependencies are not shown.

## Security and Privacy

AIC is designed around local-first operation and explicit user control.

- Project context is maintained locally.
- Incoming context packages are validated before use.
- Ingestion supports a preview-first workflow.
- Applying ingestion requires the explicit `--apply` option and successful validation.
- Personal memories are stored separately from shareable project context.
- Personal memories are excluded from exported context packages by default.
- MCP integration is designed to expose project information through read-only interfaces.

Always review context packages and proposed changes before using them in a project.

## Project Status

AIC is under active development.

Current implemented areas include:

- Structured project state management
- Local memory management
- Context compilation
- Context export, inspection, and import
- Secure context ingestion
- CLI integration
- Read-only MCP integration
- Execution proposal and approval components

The broader vision includes more capable cross-provider continuity, permission-controlled integrations, and observable AI-assisted execution workflows.

## Design Principles

1. **Local-first:** Keep project context under developer control.
2. **Provider-neutral:** Avoid dependence on a single AI provider.
3. **Privacy-conscious:** Separate personal memories from shareable project data.
4. **Explicit consent:** Keep context sharing and execution approval under user control.
5. **Structured and portable:** Prefer validated project data over fragmented conversation history.
6. **Incremental development:** Build capabilities through independently testable components.

## Contributing

Contributions, suggestions, bug reports, and discussions are welcome.

Please open an issue before making major architectural changes.

## License

This project is licensed under the [Apache License 2.0](LICENSE).