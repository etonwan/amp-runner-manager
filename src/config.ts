import { constants } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { ManagerConfig, ProjectRecord } from "./types";
import {
  assertNoConflicts,
  normalizeName,
  PROJECT_NAME_PATTERN,
} from "./naming";

export interface StatePaths {
  root: string;
  config: string;
  jobs: string;
  logs: string;
}

export function statePaths(home = homedir()): StatePaths {
  const root = resolve(
    home,
    "Library",
    "Application Support",
    "Amp Runner Manager",
  );
  return {
    root,
    config: resolve(root, "config.json"),
    jobs: resolve(root, "jobs"),
    logs: resolve(root, "logs"),
  };
}

export async function ensureState(paths: StatePaths): Promise<void> {
  await mkdir(paths.jobs, { recursive: true, mode: 0o700 });
  await mkdir(paths.logs, { recursive: true, mode: 0o700 });
  await chmod(paths.root, 0o700);
  await chmod(paths.jobs, 0o700);
  await chmod(paths.logs, 0o700);
}

function initialRoots(home: string): string[] {
  const configured = process.env.AMP_RUNNER_MANAGER_ALLOWED_ROOTS;
  if (!configured) return [home];
  return configured.split(":").filter(Boolean);
}

function isProject(value: unknown): value is ProjectRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.name === "string" &&
    PROJECT_NAME_PATTERN.test(item.name) &&
    Array.isArray(item.aliases) &&
    item.aliases.every(
      (alias) => typeof alias === "string" && PROJECT_NAME_PATTERN.test(alias),
    ) &&
    typeof item.path === "string" &&
    isAbsolute(item.path) &&
    typeof item.runnerId === "string" &&
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(item.runnerId)
  );
}

function validateConfig(value: unknown): ManagerConfig {
  if (!value || typeof value !== "object")
    throw new Error("config must be a JSON object");
  const config = value as Record<string, unknown>;
  if (
    config.version !== 1 ||
    !Array.isArray(config.allowedRoots) ||
    config.allowedRoots.length === 0 ||
    !config.allowedRoots.every(
      (root) => typeof root === "string" && isAbsolute(root),
    ) ||
    !Array.isArray(config.projects) ||
    !config.projects.every(isProject)
  ) {
    throw new Error("config has an invalid schema");
  }
  const validated = config as unknown as ManagerConfig;
  const prior: ProjectRecord[] = [];
  for (const project of validated.projects) {
    const ownNames = [project.name, ...project.aliases].map(normalizeName);
    if (new Set(ownNames).size !== ownNames.length) {
      throw new Error(
        `config project "${project.name}" has duplicate names or aliases`,
      );
    }
    assertNoConflicts(prior, project);
    prior.push(project);
  }
  return validated;
}

export async function loadConfig(
  paths: StatePaths,
  home = homedir(),
): Promise<ManagerConfig> {
  await ensureState(paths);
  try {
    return validateConfig(JSON.parse(await readFile(paths.config, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const allowedRoots = await Promise.all(
      initialRoots(home).map(async (root) => realpath(resolve(root))),
    );
    const config: ManagerConfig = { version: 1, allowedRoots, projects: [] };
    await saveConfig(paths, config);
    return config;
  }
}

export async function saveConfig(
  paths: StatePaths,
  config: ManagerConfig,
): Promise<void> {
  validateConfig(config);
  await ensureState(paths);
  const temporary = `${paths.config}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, paths.config);
  await chmod(paths.config, 0o600);
}

export function isWithinRoot(path: string, root: string): boolean {
  const child = relative(root, path);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

export async function canonicalizeProjectPath(
  input: string,
  allowedRoots: string[],
): Promise<string> {
  if (!isAbsolute(input)) throw new Error("project path must be absolute");
  const canonical = await realpath(input);
  if (!(await stat(canonical)).isDirectory())
    throw new Error("project path must be a directory");
  const roots = await Promise.all(allowedRoots.map((root) => realpath(root)));
  if (!roots.some((root) => isWithinRoot(canonical, root))) {
    throw new Error(
      `project path is outside allowed roots: ${roots.join(", ")}`,
    );
  }

  const result = Bun.spawnSync(
    ["/usr/bin/git", "-C", canonical, "rev-parse", "--show-toplevel"],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  if (result.exitCode !== 0)
    throw new Error("project path must be a Git repository");
  const topLevel = await realpath(result.stdout.toString().trim());
  if (topLevel !== canonical)
    throw new Error(`path must be the Git repository root: ${topLevel}`);
  return canonical;
}

export async function resolveAmpExecutable(): Promise<string> {
  const configured = process.env.AMP_RUNNER_MANAGER_AMP_PATH;
  if (configured && !isAbsolute(configured)) {
    throw new Error("AMP_RUNNER_MANAGER_AMP_PATH must be absolute");
  }

  const candidates = configured
    ? [configured]
    : (process.env.PATH ?? "")
        .split(":")
        .filter(Boolean)
        .map((entry) => resolve(entry, "amp"));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      const canonical = await realpath(candidate);
      if ((await stat(canonical)).isFile()) return canonical;
    } catch {
      // Try the next PATH entry.
    }
  }
  throw new Error(
    "could not find an executable amp; set AMP_RUNNER_MANAGER_AMP_PATH to its absolute path",
  );
}

export function configDirectory(path: string): string {
  return dirname(path);
}
