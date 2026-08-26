import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  canonicalizeProjectPath,
  isWithinRoot,
  loadConfig,
  saveConfig,
  statePaths,
} from "../src/config";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("path validation", () => {
  test("persists validated configuration atomically", async () => {
    const home = await mkdtemp(resolve(tmpdir(), "runner-manager-home-"));
    temporary.push(home);
    const paths = statePaths(home);
    const config = await loadConfig(paths, home);
    expect(config).toEqual({ version: 1, allowedRoots: [home], projects: [] });

    config.projects.push({
      name: "repo",
      aliases: ["work"],
      path: resolve(home, "repo"),
      runnerId: "amp-repo-1234567890",
    });
    await saveConfig(paths, config);
    expect(await loadConfig(paths, home)).toEqual(config);
  });

  test("rejects conflicting records in persisted configuration", async () => {
    const home = await mkdtemp(resolve(tmpdir(), "runner-manager-conflict-"));
    temporary.push(home);
    const paths = statePaths(home);
    const config = await loadConfig(paths, home);
    config.projects.push(
      {
        name: "first",
        aliases: ["shared"],
        path: resolve(home, "first"),
        runnerId: "amp-first-1234567890",
      },
      {
        name: "second",
        aliases: ["SHARED"],
        path: resolve(home, "second"),
        runnerId: "amp-second-1234567890",
      },
    );
    await expect(saveConfig(paths, config)).rejects.toThrow("conflicts");
  });

  test("uses path boundaries rather than string prefixes", () => {
    expect(isWithinRoot("/Users/me/src/repo", "/Users/me/src")).toBe(true);
    expect(isWithinRoot("/Users/me/src-other/repo", "/Users/me/src")).toBe(
      false,
    );
    expect(isWithinRoot("/Users/me/src/../secret", "/Users/me/src")).toBe(
      false,
    );
  });

  test("canonicalizes a Git root and rejects subdirectories and paths outside roots", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "runner-manager-"));
    temporary.push(root);
    const repo = resolve(root, "repo");
    await mkdir(resolve(repo, "nested"), { recursive: true });
    expect(Bun.spawnSync(["git", "init", "-q", repo]).exitCode).toBe(0);

    await expect(canonicalizeProjectPath(repo, [root])).resolves.toBe(
      await realpath(repo),
    );
    await expect(
      canonicalizeProjectPath(resolve(repo, "nested"), [root]),
    ).rejects.toThrow("repository root");

    const outside = await mkdtemp(resolve(tmpdir(), "runner-manager-outside-"));
    temporary.push(outside);
    expect(Bun.spawnSync(["git", "init", "-q", outside]).exitCode).toBe(0);
    await expect(canonicalizeProjectPath(outside, [root])).rejects.toThrow(
      "outside allowed roots",
    );
  });

  test("resolves symlinks before checking the allowed root", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "runner-manager-root-"));
    const outside = await mkdtemp(resolve(tmpdir(), "runner-manager-target-"));
    temporary.push(root, outside);
    expect(Bun.spawnSync(["git", "init", "-q", outside]).exitCode).toBe(0);
    const link = resolve(root, "linked-repo");
    await symlink(outside, link);
    await expect(canonicalizeProjectPath(link, [root])).rejects.toThrow(
      "outside allowed roots",
    );
  });
});
