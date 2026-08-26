import { chmod, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { JobStatus, ProjectRecord } from "./types";
import type { StatePaths } from "./config";
import { makeLabel, renderPlist } from "./plist";

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type RunCommand = (args: string[]) => Promise<CommandResult>;

export async function runCommand(args: string[]): Promise<CommandResult> {
  const process = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

export function parseLaunchctlPrint(output: string): Omit<JobStatus, "loaded"> {
  const state = /^\s*state = (.+)$/m.exec(output)?.[1]?.trim();
  const pidText = /^\s*pid = (\d+)$/m.exec(output)?.[1];
  const exitText = /^\s*last exit code = (-?\d+)$/m.exec(output)?.[1];
  return {
    ...(state ? { state } : {}),
    ...(pidText ? { pid: Number(pidText) } : {}),
    ...(exitText ? { lastExitCode: Number(exitText) } : {}),
  };
}

export class LaunchdManager {
  readonly domain: string;

  constructor(
    private readonly paths: StatePaths,
    private readonly command: RunCommand = runCommand,
    uid = process.getuid?.(),
  ) {
    if (uid === undefined)
      throw new Error("could not determine current user ID");
    this.domain = `gui/${uid}`;
  }

  private target(project: ProjectRecord): string {
    return `${this.domain}/${makeLabel(project.runnerId)}`;
  }

  plistPath(project: ProjectRecord): string {
    return resolve(this.paths.jobs, `${project.runnerId}.plist`);
  }

  logPaths(project: ProjectRecord): { stdout: string; stderr: string } {
    return {
      stdout: resolve(this.paths.logs, `${project.runnerId}.stdout.log`),
      stderr: resolve(this.paths.logs, `${project.runnerId}.stderr.log`),
    };
  }

  async status(project: ProjectRecord): Promise<JobStatus> {
    const result = await this.command([
      "/bin/launchctl",
      "print",
      this.target(project),
    ]);
    if (result.exitCode !== 0) return { loaded: false };
    return { loaded: true, ...parseLaunchctlPrint(result.stdout) };
  }

  async start(
    project: ProjectRecord,
    ampPath: string,
  ): Promise<{
    status: JobStatus;
    alreadyRunning: boolean;
    logs: { stdout: string; stderr: string };
  }> {
    const current = await this.status(project);
    const logs = this.logPaths(project);
    if (current.loaded) return { status: current, alreadyRunning: true, logs };

    const plistPath = this.plistPath(project);
    await writeFile(
      plistPath,
      renderPlist({
        label: makeLabel(project.runnerId),
        ampPath,
        runnerId: project.runnerId,
        cwd: project.path,
        stdoutPath: logs.stdout,
        stderrPath: logs.stderr,
        ...(process.env.PATH ? { pathEnvironment: process.env.PATH } : {}),
      }),
      { mode: 0o600 },
    );
    await chmod(plistPath, 0o600);
    const result = await this.command([
      "/bin/launchctl",
      "bootstrap",
      this.domain,
      plistPath,
    ]);
    if (result.exitCode !== 0) {
      await rm(plistPath, { force: true });
      throw new Error(
        `launchctl bootstrap failed: ${result.stderr.trim() || result.stdout.trim()}`,
      );
    }
    const status = await this.status(project);
    if (!status.loaded) {
      await rm(plistPath, { force: true });
      throw new Error("launchd accepted the job but it is not loaded");
    }
    return { status, alreadyRunning: false, logs };
  }

  async stop(
    project: ProjectRecord,
  ): Promise<{ stopped: boolean; status: JobStatus }> {
    const current = await this.status(project);
    if (!current.loaded) {
      await rm(this.plistPath(project), { force: true });
      return { stopped: false, status: current };
    }
    const result = await this.command([
      "/bin/launchctl",
      "bootout",
      this.target(project),
    ]);
    if (result.exitCode !== 0) {
      throw new Error(
        `launchctl bootout failed: ${result.stderr.trim() || result.stdout.trim()}`,
      );
    }
    const status = await this.status(project);
    if (status.loaded)
      throw new Error(
        "launchctl bootout returned success but the job is still loaded",
      );
    await rm(this.plistPath(project), { force: true });
    return { stopped: true, status };
  }
}

export function assertMacOS(platform = process.platform): void {
  if (platform !== "darwin") {
    throw new Error(
      `amp-runner-manager requires macOS; current platform is ${platform}`,
    );
  }
}
