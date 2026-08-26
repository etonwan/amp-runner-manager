import {
  canonicalizeProjectPath,
  loadConfig,
  resolveAmpExecutable,
  saveConfig,
} from "./config";
import type { StatePaths } from "./config";
import { assertMacOS, LaunchdManager } from "./launchd";
import {
  assertNoConflicts,
  makeRunnerId,
  normalizeName,
  resolveProject,
  validateProjectName,
} from "./naming";
import type { ProjectRecord, Resolution } from "./types";

export class RunnerManagerService {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly paths: StatePaths,
    private readonly launchd = new LaunchdManager(paths),
  ) {}

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private requireMacOS(): void {
    assertMacOS();
  }

  async registerProject(input: {
    name: string;
    path: string;
    aliases?: string[];
  }): Promise<ProjectRecord> {
    return this.exclusive(async () => {
      this.requireMacOS();
      const config = await loadConfig(this.paths);
      const name = validateProjectName(input.name);
      const aliases = (input.aliases ?? []).map((alias, index) =>
        validateProjectName(alias, `aliases[${index}]`),
      );
      const ownNames = [name, ...aliases].map(normalizeName);
      if (new Set(ownNames).size !== ownNames.length) {
        throw new Error("name and aliases must be unique (case-insensitive)");
      }
      const path = await canonicalizeProjectPath(
        input.path,
        config.allowedRoots,
      );
      const project: ProjectRecord = {
        name,
        aliases,
        path,
        runnerId: makeRunnerId(path),
      };
      assertNoConflicts(config.projects, project);
      config.projects.push(project);
      config.projects.sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      await saveConfig(this.paths, config);
      return project;
    });
  }

  async resolve(query: string): Promise<Resolution> {
    const config = await loadConfig(this.paths);
    return resolveProject(config.projects, query);
  }

  async removeProject(
    query: string,
  ): Promise<{ removed: boolean; resolution: Resolution }> {
    return this.exclusive(async () => {
      this.requireMacOS();
      const config = await loadConfig(this.paths);
      const resolution = resolveProject(config.projects, query);
      if (resolution.kind !== "found") return { removed: false, resolution };
      const status = await this.launchd.status(resolution.project);
      if (status.loaded) {
        throw new Error(
          `project runner ${resolution.project.runnerId} is loaded; stop it before removing the project`,
        );
      }
      config.projects = config.projects.filter(
        (project) => project.runnerId !== resolution.project.runnerId,
      );
      await saveConfig(this.paths, config);
      return { removed: true, resolution };
    });
  }

  async startProjectRunner(query: string): Promise<
    | { started: false; resolution: Exclude<Resolution, { kind: "found" }> }
    | {
        started: true;
        project: ProjectRecord;
        alreadyRunning: boolean;
        status: Awaited<ReturnType<LaunchdManager["status"]>>;
        logs: ReturnType<LaunchdManager["logPaths"]>;
      }
  > {
    return this.exclusive(async () => {
      this.requireMacOS();
      const config = await loadConfig(this.paths);
      const resolution = resolveProject(config.projects, query);
      if (resolution.kind !== "found") return { started: false, resolution };
      const canonical = await canonicalizeProjectPath(
        resolution.project.path,
        config.allowedRoots,
      );
      if (canonical !== resolution.project.path) {
        throw new Error(
          "registered project path no longer resolves to its canonical path",
        );
      }
      const ampPath = await resolveAmpExecutable();
      const result = await this.launchd.start(resolution.project, ampPath);
      return {
        started: true,
        project: resolution.project,
        alreadyRunning: result.alreadyRunning,
        status: result.status,
        logs: result.logs,
      };
    });
  }

  async stopProjectRunner(query: string): Promise<
    | { matched: false; resolution: Exclude<Resolution, { kind: "found" }> }
    | {
        matched: true;
        project: ProjectRecord;
        stopped: boolean;
        status: Awaited<ReturnType<LaunchdManager["status"]>>;
      }
  > {
    return this.exclusive(async () => {
      this.requireMacOS();
      const config = await loadConfig(this.paths);
      const resolution = resolveProject(config.projects, query);
      if (resolution.kind !== "found") return { matched: false, resolution };
      const result = await this.launchd.stop(resolution.project);
      return {
        matched: true,
        project: resolution.project,
        stopped: result.stopped,
        status: result.status,
      };
    });
  }

  async listProjectRunners(): Promise<{
    projects: Array<
      ProjectRecord & {
        status: Awaited<ReturnType<LaunchdManager["status"]>>;
        logs: ReturnType<LaunchdManager["logPaths"]>;
      }
    >;
  }> {
    return this.exclusive(async () => {
      this.requireMacOS();
      const config = await loadConfig(this.paths);
      const projects = await Promise.all(
        config.projects.map(async (project) => ({
          ...project,
          status: await this.launchd.status(project),
          logs: this.launchd.logPaths(project),
        })),
      );
      return { projects };
    });
  }
}
