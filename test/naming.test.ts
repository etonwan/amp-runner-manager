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

  test("creates a stable valid hostname label from the folder name", () => {
    const first = makeRunnerId("/Users/test/src/My Project");
    expect(first).toBe(makeRunnerId("/Users/test/src/My Project"));
    expect(first).toBe("my-project");
    expect(first).toMatch(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);
    expect(first.length).toBeLessThanOrEqual(63);
  });

  test("rejects runner ID conflicts from matching folder names", () => {
    expect(() =>
      assertNoConflicts(
        [
          {
            name: "first-shop",
            aliases: [],
            path: "/Users/test/first/shop",
            runnerId: makeRunnerId("/Users/test/first/shop"),
          },
        ],
        {
          name: "second-shop",
          aliases: [],
          path: "/Users/test/second/shop",
          runnerId: makeRunnerId("/Users/test/second/shop"),
        },
      ),
    ).toThrow('runner ID conflicts with project "first-shop"');
  });
});
