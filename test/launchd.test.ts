import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { StatePaths } from "../src/config";
import { LaunchdManager, parseLaunchctlPrint } from "../src/launchd";
import type { ProjectRecord } from "../src/types";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

const project: ProjectRecord = {
  name: "shop",
  aliases: [],
  path: "/Users/me/shop",
  runnerId: "amp-shop-1234567890",
};

async function paths(): Promise<StatePaths> {
  const root = await mkdtemp(resolve(tmpdir(), "runner-launchd-"));
  temporary.push(root);
  const result = {
    root,
    config: resolve(root, "config.json"),
    jobs: resolve(root, "jobs"),
    logs: resolve(root, "logs"),
  };
  await mkdir(result.jobs);
  await mkdir(result.logs);
  return result;
}

describe("launchctl integration boundary", () => {
  test("parses diagnostic fields without requiring them", () => {
    expect(
      parseLaunchctlPrint(
        `com.example = {\n\tstate = running\n\tpid = 4321\n\tlast exit code = 7\n}`,
      ),
    ).toEqual({ state: "running", pid: 4321, lastExitCode: 7 });
    expect(parseLaunchctlPrint("format changed")).toEqual({});
  });

  test("bootstraps by plist path and stops by service target", async () => {
    const calls: string[][] = [];
    let loaded = false;
    const command = async (args: string[]) => {
      calls.push(args);
      if (args[1] === "bootstrap") loaded = true;
      if (args[1] === "bootout") loaded = false;
      return {
        exitCode: args[1] === "print" && !loaded ? 113 : 0,
        stdout:
          loaded && args[1] === "print"
            ? "\tstate = running\n\tpid = 42\n"
            : "",
        stderr: "",
      };
    };
    const manager = new LaunchdManager(await paths(), command, 501);

    const started = await manager.start(project, "/opt/homebrew/bin/amp", true);
    expect(started.status).toEqual({ loaded: true, state: "running", pid: 42 });
    expect(calls.find((args) => args[1] === "bootstrap")).toEqual([
      "/bin/launchctl",
      "bootstrap",
      "gui/501",
      manager.plistPath(project),
    ]);

    expect((await manager.stop(project)).stopped).toBe(true);
    expect(calls.find((args) => args[1] === "bootout")).toEqual([
      "/bin/launchctl",
      "bootout",
      "gui/501/com.amp.runner-manager.amp-shop-1234567890",
    ]);
  });
});
