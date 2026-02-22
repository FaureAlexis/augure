export type SkillStatus = "draft" | "testing" | "active" | "paused" | "broken";

export interface SkillMeta {
  id: string;
  name: string;
  version: number;
  created: string;
  updated: string;
  status: SkillStatus;
  trigger: {
    type: "cron" | "manual" | "event";
    schedule?: string;
    channel?: string;
  };
  sandbox: boolean;
  tools: string[];
  tags: string[];
}

export interface SkillRunResult {
  skillId: string;
  timestamp: string;
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
  tokens?: { input: number; output: number; cost: number };
}

/** Full skill representation loaded from disk */
export interface Skill {
  meta: SkillMeta;
  /** Raw markdown body from skill.md (below the YAML frontmatter) */
  body: string;
  /** TypeScript source code from skill.ts */
  code?: string;
  /** TypeScript test source from skill.test.ts */
  testCode?: string;
}

/** Index entry stored in skills-index.json for fast discovery */
export interface SkillIndexEntry {
  id: string;
  name: string;
  version: number;
  status: SkillStatus;
  trigger: SkillMeta["trigger"];
  tags: string[];
  updated: string;
}

/** Full index file format */
export interface SkillIndex {
  version: 1;
  skills: SkillIndexEntry[];
}

/** Skill-local key-value state persisted between runs */
export interface SkillState {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Context passed to a skill during execution in the sandbox */
export interface SkillContext {
  exec: (
    command: string,
    opts?: { timeout?: number; env?: Record<string, string> },
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  memory: {
    read(path: string): Promise<string>;
    list(directory?: string): Promise<string[]>;
  };
  state: SkillState;
  previousRun: SkillRunResult | null;
  config: SkillMeta;
}

/** Options for generating a skill */
export interface SkillGenerateRequest {
  description: string;
  trigger: SkillMeta["trigger"];
  sandbox?: boolean;
  tags?: string[];
}

/** Result of a skill generation attempt */
export interface SkillGenerateResult {
  success: boolean;
  skill?: Skill;
  error?: string;
}

/** Result of a skill test run */
export interface SkillTestResult {
  success: boolean;
  passed: number;
  failed: number;
  output: string;
  error?: string;
}

/** Skills configuration section */
export interface SkillsConfig {
  path: string;
  maxFailures: number;
  autoSuggest: boolean;
  hub?: {
    repo: string;
    branch?: string;
  };
}
