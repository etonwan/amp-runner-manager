export interface ProjectRecord {
  name: string;
  aliases: string[];
  path: string;
  runnerId: string;
}

export interface ManagerConfig {
  version: 1;
  allowedRoots: string[];
  projects: ProjectRecord[];
}

export interface Candidate {
  name: string;
  aliases: string[];
  path: string;
  runnerId: string;
}

export type Resolution =
  | { kind: "found"; project: ProjectRecord }
  | { kind: "not_found"; candidates: Candidate[] }
  | { kind: "ambiguous"; candidates: Candidate[] };

export interface JobStatus {
  loaded: boolean;
  state?: string;
  pid?: number;
  lastExitCode?: number;
}
