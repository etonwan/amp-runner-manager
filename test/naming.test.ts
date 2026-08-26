import { describe, expect, test } from "bun:test";
import {
  assertNoConflicts,
  makeRunnerId,
  resolveProject,
  validateProjectName,
} from "../src/naming";
import type { ProjectRecord } from "../src/types";

const projects: ProjectRecord[] = [
  {
    name: "storefront",
    aliases: ["shop", "web"],
    path: "/Users/test/src/storefront",
    runnerId: "amp-storefront-1111111111",
  },
  {
    name: "store-api",
    aliases: ["api"],
    path: "/Users/test/src/store-api",
    runnerId: "amp-store-api-2222222222",
  },
];

describe("project names and resolution", () => {
  test("resolves names and aliases exactly without case sensitivity", () => {
    expect(resolveProject(projects, " SHOP ")).toEqual({
      kind: "found",
      project: projects[0]!,
    });
  });

  test("returns candidates rather than selecting a partial match", () => {
    expect(resolveProject(projects, "store")).toEqual({
      kind: "ambiguous",
      candidates: projects.map(({ name, aliases, path, runnerId }) => ({
        name,
        aliases,
        path,
        runnerId,
      })),
    });
    expect(resolveProject(projects, "front")).toMatchObject({
      kind: "not_found",
      candidates: [{ name: "storefront" }],
    });
  });

  test("rejects unsafe names and case-insensitive conflicts", () => {
    expect(() => validateProjectName("../shop")).toThrow();
    expect(() => validateProjectName("shop one")).toThrow();
    expect(() =>
      assertNoConflicts(projects, {
        name: "other",
        aliases: ["SHOP"],
        path: "/Users/test/src/other",
        runnerId: "amp-other-3333333333",
      }),
    ).toThrow("conflicts");
  });

  test("creates a stable valid hostname label", () => {
    const first = makeRunnerId("/Users/test/src/My Project");
    expect(first).toBe(makeRunnerId("/Users/test/src/My Project"));
    expect(first).toMatch(/^my-project-amp-[a-f0-9]{10}$/);
    expect(first).toMatch(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);
    expect(first.length).toBeLessThanOrEqual(63);
  });
});
