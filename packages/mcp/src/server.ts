import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import {
  getProjectSummaryTool,
  getCurrentTaskTool,
  listDecisionsTool,
  listIssuesTool,
  getConstraintsTool,
  getRelevantFilesTool,
  compileContextTool,
  submitProposalTool
} from "./tools.js";

export function createAicMcpServer(projectRoot?: string) {
  const server = new Server(
    {
      name: "aic-mcp-server",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "aic_get_project_summary",
        description: "Return the validated project summary and objective",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "aic_get_current_task",
        description: "Return the current task and status",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "aic_list_decisions",
        description: "List recorded project decisions",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "aic_list_issues",
        description: "Return recorded issues",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "aic_get_constraints",
        description: "Return project constraints",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "aic_get_relevant_files",
        description: "Return the curated list of relevant project files",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "aic_compile_context",
        description: "Produce task-specific compiled context using AIC core compiler",
        inputSchema: {
          type: "object",
          properties: {
            maxCharacters: { type: "number", description: "Optional character budget limit" }
          }
        }
      },
      {
        name: "aic_submit_proposal",
        description: "Submit a structured execution proposal for operator review (does not execute)",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "The task identifier" },
            executable: { type: "string", description: "The executable command to propose" },
            arguments: {
              type: "array",
              items: { type: "string" },
              description: "Arguments for the executable"
            }
          },
          required: ["taskId", "executable", "arguments"]
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;

      switch (request.params.name) {
        case "aic_get_project_summary":
          return { content: [{ type: "text", text: JSON.stringify(getProjectSummaryTool(projectRoot), null, 2) }] };
        case "aic_get_current_task":
          return { content: [{ type: "text", text: JSON.stringify(getCurrentTaskTool(projectRoot), null, 2) }] };
        case "aic_list_decisions":
          return { content: [{ type: "text", text: JSON.stringify(listDecisionsTool(projectRoot), null, 2) }] };
        case "aic_list_issues":
          return { content: [{ type: "text", text: JSON.stringify(listIssuesTool(projectRoot), null, 2) }] };
        case "aic_get_constraints":
          return { content: [{ type: "text", text: JSON.stringify(getConstraintsTool(projectRoot), null, 2) }] };
        case "aic_get_relevant_files":
          return { content: [{ type: "text", text: JSON.stringify(getRelevantFilesTool(projectRoot), null, 2) }] };
        case "aic_compile_context": {
          const maxChars = typeof args.maxCharacters === "number" ? args.maxCharacters : undefined;
          const compiled = await compileContextTool(projectRoot, maxChars);
          return { content: [{ type: "text", text: JSON.stringify(compiled, null, 2) }] };
        }
        case "aic_submit_proposal": {
          const taskId = typeof args.taskId === "string" ? args.taskId : "";
          const executable = typeof args.executable === "string" ? args.executable : "";
          const argList = Array.isArray(args.arguments) ? (args.arguments as string[]) : [];

          const result = submitProposalTool(
            {
              taskId,
              executable,
              arguments: argList
            },
            projectRoot
          );
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      };
    }
  });

  return server;
}

export async function runServer(projectRoot?: string) {
  const server = createAicMcpServer(projectRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}