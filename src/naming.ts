import { createHash } from "node:crypto";
import { basename } from "node:path";
import type { Candidate, ProjectRecord, Resolution } from "./types";

export const PROJECT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export function validateProjectName(value: string, field = "name"): string {
  const trimmed = value.trim();
  if (!PROJECT_NAME_PATTERN.test(trimmed)) {
    throw new Error(
      `${field} must be 1-64 characters and contain only ASCII letters, digits, dot, underscore, or hyphen; it must start with a letter or digit`,
    );
  }
  return trimmed;
}

export function makeRunnerId(canonicalPath: string): string {
  const slug = basename(canonicalPath)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const hash = createHash("sha256")
    .update(canonicalPath)
    .digest("hex")
    .slice(0, 10);
  return `${slug || "repo"}-amp-${hash}`;
}

function candidate(project: ProjectRecord): Candidate {
  return {
    name: project.name,
    aliases: project.aliases,
    path: project.path,
    runnerId: project.runnerId,
  };
}

export function resolveProject(
  projects: ProjectRecord[],
  query: string,
): Resolution {
  const normalized = normalizeName(query);
  const exact = projects.filter((project) =>
    [project.name, ...project.aliases].some(
      (name) => normalizeName(name) === normalized,
    ),
  );
  if (exact.length === 1) return { kind: "found", project: exact[0]! };
  if (exact.length > 1)
    return { kind: "ambiguous", candidates: exact.map(candidate) };

  const partial = projects.filter((project) =>
    [project.name, ...project.aliases].some((name) =>
      normalizeName(name).includes(normalized),
    ),
  );
  return {
    kind: partial.length > 1 ? "ambiguous" : "not_found",
    candidates: partial.map(candidate),
  };
}

export function assertNoConflicts(
  projects: ProjectRecord[],
  proposed: ProjectRecord,
  replacingPath?: string,
): void {
  const proposedNames = new Set(
    [proposed.name, ...proposed.aliases].map(normalizeName),
  );
  for (const project of projects) {
    if (project.path === replacingPath) continue;
    const overlap = [project.name, ...project.aliases].find((name) =>
      proposedNames.has(normalizeName(name)),
    );
    if (overlap)
      throw new Error(
        `name or alias conflicts with project "${project.name}": ${overlap}`,
      );
    if (project.path === proposed.path) {
      throw new Error(
        `path is already registered as project "${project.name}"`,
      );
    }
    if (project.runnerId.toLowerCase() === proposed.runnerId.toLowerCase()) {
      throw new Error(`runner ID conflicts with project "${project.name}"`);
    }
  }
}
