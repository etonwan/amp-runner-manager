import type { PluginAPI, PluginToolDefinition } from "@ampcode/plugin";
import { statePaths } from "./src/config";
import { RunnerManagerService } from "./src/service";

export const description =
  "Registers local Git projects and starts or stops temporary project-scoped Amp runners on macOS.";

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function errorResult(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return json({ ok: false, error: { code: "operation_failed", message } });
}

function tool(
  service: RunnerManagerService,
  definition: Omit<PluginToolDefinition, "execute"> & {
    run: (
      input: Record<string, unknown>,
      service: RunnerManagerService,
    ) => Promise<unknown>;
  },
): PluginToolDefinition {
  return {
    name: definition.name,
    ...(definition.title ? { title: definition.title } : {}),
    description: definition.description,
    inputSchema: definition.inputSchema,
    async execute(input) {
      try {
        return json({ ok: true, result: await definition.run(input, service) });
      } catch (error) {
        return errorResult(error);
      }
    },
  };
}

const projectQuery = {
  type: "string",
  minLength: 1,
  description:
    "Registered project name or exact alias; do not pass a filesystem path.",
};

export default async function (amp: PluginAPI) {
  const service = new RunnerManagerService(statePaths());

  const tools: PluginToolDefinition[] = [
    tool(service, {
      name: "register_project",
      title: "Register runner project",
      description:
        "Persistently register a macOS Git repository by a name and optional aliases. The path is needed only on first registration and must be an allowed absolute canonicalizable path.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            minLength: 1,
            description:
              "Unique project name (ASCII letters, digits, dot, underscore, hyphen).",
          },
          path: {
            type: "string",
            minLength: 1,
            description:
              "Absolute path to the Git repository root on the management Mac.",
          },
          aliases: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional unique alternate names for natural-language lookup.",
          },
        },
        required: ["name", "path"],
        additionalProperties: false,
      },
      run: (input, manager) =>
        manager.registerProject({
          name: input.name as string,
          path: input.path as string,
          ...(Array.isArray(input.aliases)
            ? { aliases: input.aliases as string[] }
            : {}),
        }),
    }),
    tool(service, {
      name: "remove_project",
      title: "Remove runner project",
      description:
        "Remove a registered project mapping. A loaded runner must be stopped first. Returns candidates instead of guessing when lookup is missing or ambiguous.",
      inputSchema: {
        type: "object",
        properties: { project: projectQuery },
        required: ["project"],
        additionalProperties: false,
      },
      run: (input, manager) => manager.removeProject(input.project as string),
    }),
    tool(service, {
      name: "start_project_runner",
      title: "Start project runner",
      description:
        "Start the temporary launchd-managed Amp runner for a registered project. Uses the stored path as cwd and returns candidates rather than guessing. Does not require a path.",
      inputSchema: {
        type: "object",
        properties: {
          project: projectQuery,
          remote_control_terminal: {
            type: "boolean",
            default: false,
            description: "Enable Amp remote terminal access for this runner.",
          },
        },
        required: ["project"],
        additionalProperties: false,
      },
      run: (input, manager) =>
        manager.startProjectRunner(
          input.project as string,
          input.remote_control_terminal === true,
        ),
    }),
    tool(service, {
      name: "stop_project_runner",
      title: "Stop project runner",
      description:
        "Stop and unload a temporary runner for a registered project. Returns candidates rather than guessing when lookup is missing or ambiguous.",
      inputSchema: {
        type: "object",
        properties: { project: projectQuery },
        required: ["project"],
        additionalProperties: false,
      },
      run: (input, manager) =>
        manager.stopProjectRunner(input.project as string),
    }),
    tool(service, {
      name: "list_project_runners",
      title: "List project runners",
      description:
        "List every registered project and alias, stable runner ID, canonical path, launchd load/running status, and log paths.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      run: (_input, manager) => manager.listProjectRunners(),
    }),
  ];

  for (const definition of tools) amp.registerTool(definition);
  await amp.registerSkill({ path: "skills/managing-project-runners" });
}
