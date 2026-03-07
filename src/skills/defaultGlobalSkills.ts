import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ensureAiCoworkerHome, getAiCoworkerPaths } from "../store/connections";

const DEFAULT_SKILLS_REPO = "openai/skills";
const DEFAULT_SKILLS_REF = "main";
const DEFAULT_SKILLS_STATE_FILE = "default-global-skills.json";
const INSTALL_STATE_VERSION = 1;
const bootstrapPromises = new Map<string, Promise<EnsureDefaultGlobalSkillsInstalledResult | null>>();

type FetchLike = typeof fetch;

type GitHubContentEntry = {
  type: "file" | "dir";
  name: string;
  path: string;
  url: string;
  download_url: string | null;
};

type DefaultGlobalSkillsState = {
  version: number;
  repo: string;
  ref: string;
  installedAt: string;
  skills: string[];
};

export type DefaultSkillSpec = {
  name: string;
  githubPath: string;
};

export const DEFAULT_GLOBAL_SKILLS: readonly DefaultSkillSpec[] = [
  { name: "spreadsheet", githubPath: "skills/.curated/spreadsheet" },
  { name: "slides", githubPath: "skills/.curated/slides" },
  { name: "pdf", githubPath: "skills/.curated/pdf" },
  { name: "doc", githubPath: "skills/.curated/doc" },
] as const;

export type EnsureDefaultGlobalSkillsInstalledResult = {
  status: "installed" | "already_installed";
  skillsDir: string;
  stateFile: string;
  installed: string[];
  skippedExisting: string[];
};

function encodeGitHubPath(githubPath: string): string {
  return githubPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildGitHubApiUrl(repo: string, ref: string, githubPath: string): string {
  return `https://api.github.com/repos/${repo}/contents/${encodeGitHubPath(githubPath)}?ref=${encodeURIComponent(ref)}`;
}

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "agent-coworker-default-skills",
  };

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readState(stateFile: string): Promise<DefaultGlobalSkillsState | null> {
  try {
    const raw = await fs.readFile(stateFile, "utf-8");
    const parsed = JSON.parse(raw) as Partial<DefaultGlobalSkillsState>;
    if (
      parsed.version !== INSTALL_STATE_VERSION ||
      typeof parsed.repo !== "string" ||
      typeof parsed.ref !== "string" ||
      typeof parsed.installedAt !== "string" ||
      !Array.isArray(parsed.skills)
    ) {
      return null;
    }
    return {
      version: parsed.version,
      repo: parsed.repo,
      ref: parsed.ref,
      installedAt: parsed.installedAt,
      skills: parsed.skills.filter((value): value is string => typeof value === "string"),
    };
  } catch {
    return null;
  }
}

async function responseError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.trim() || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

async function fetchGitHubDirectoryEntries(
  fetchImpl: FetchLike,
  repo: string,
  ref: string,
  githubPath: string
): Promise<GitHubContentEntry[]> {
  const response = await fetchImpl(buildGitHubApiUrl(repo, ref, githubPath), {
    headers: githubHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${repo}/${githubPath}@${ref}: ${await responseError(response)}`);
  }

  const parsed = await response.json();
  if (!Array.isArray(parsed)) {
    throw new Error(`GitHub API returned a non-directory payload for ${repo}/${githubPath}@${ref}`);
  }

  return parsed as GitHubContentEntry[];
}

async function fetchGitHubFile(fetchImpl: FetchLike, downloadUrl: string): Promise<Buffer> {
  const response = await fetchImpl(downloadUrl, {
    headers: githubHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${downloadUrl}: ${await responseError(response)}`);
  }

  const bytes = await response.arrayBuffer();
  return Buffer.from(bytes);
}

async function downloadGitHubDirectory(opts: {
  fetchImpl: FetchLike;
  repo: string;
  ref: string;
  githubPath: string;
  destDir: string;
}): Promise<void> {
  const { fetchImpl, repo, ref, githubPath, destDir } = opts;
  await fs.mkdir(destDir, { recursive: true });

  const entries = await fetchGitHubDirectoryEntries(fetchImpl, repo, ref, githubPath);
  for (const entry of entries) {
    if (entry.type === "dir") {
      await downloadGitHubDirectory({
        fetchImpl,
        repo,
        ref,
        githubPath: entry.path,
        destDir: path.join(destDir, entry.name),
      });
      continue;
    }

    if (entry.type !== "file" || !entry.download_url) {
      continue;
    }

    const filePath = path.join(destDir, entry.name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const bytes = await fetchGitHubFile(fetchImpl, entry.download_url);
    await fs.writeFile(filePath, bytes);
  }
}

function defaultStateFileForHomedir(homedir?: string): string {
  const paths = getAiCoworkerPaths(homedir ? { homedir } : {});
  return path.join(paths.configDir, DEFAULT_SKILLS_STATE_FILE);
}

export function defaultGlobalSkillsStateFile(homedir?: string): string {
  return defaultStateFileForHomedir(homedir);
}

function isTruthy(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function shouldBootstrapDefaultGlobalSkills(env: Record<string, string | undefined> = process.env): boolean {
  return !isTruthy(env.COWORK_SKIP_DEFAULT_SKILLS_BOOTSTRAP);
}

export async function ensureDefaultGlobalSkillsReady(opts: {
  homedir?: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  repo?: string;
  ref?: string;
  skills?: readonly DefaultSkillSpec[];
  force?: boolean;
  log?: (line: string) => void;
} = {}): Promise<EnsureDefaultGlobalSkillsInstalledResult | null> {
  const env = opts.env ?? process.env;
  if (!shouldBootstrapDefaultGlobalSkills(env)) {
    return null;
  }

  const home = path.resolve(opts.homedir ?? os.homedir());
  const existing = bootstrapPromises.get(home);
  if (existing) {
    return await existing;
  }

  const promise = (async () => {
    try {
      return await ensureDefaultGlobalSkillsInstalled(opts);
    } catch (error) {
      opts.log?.(`Default skill bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
      bootstrapPromises.delete(home);
      return null;
    }
  })();

  bootstrapPromises.set(home, promise);
  return await promise;
}

export async function ensureDefaultGlobalSkillsInstalled(opts: {
  homedir?: string;
  fetchImpl?: FetchLike;
  repo?: string;
  ref?: string;
  skills?: readonly DefaultSkillSpec[];
  force?: boolean;
  log?: (line: string) => void;
} = {}): Promise<EnsureDefaultGlobalSkillsInstalledResult> {
  const repo = opts.repo ?? DEFAULT_SKILLS_REPO;
  const ref = opts.ref ?? DEFAULT_SKILLS_REF;
  const skills = [...(opts.skills ?? DEFAULT_GLOBAL_SKILLS)];
  const fetchImpl = opts.fetchImpl ?? fetch;
  const paths = getAiCoworkerPaths(opts.homedir ? { homedir: opts.homedir } : {});
  const stateFile = defaultStateFileForHomedir(opts.homedir);

  await ensureAiCoworkerHome(paths);

  if (!opts.force) {
    const state = await readState(stateFile);
    if (state && state.repo === repo && state.ref === ref) {
      return {
        status: "already_installed",
        skillsDir: paths.skillsDir,
        stateFile,
        installed: [],
        skippedExisting: [...state.skills],
      };
    }
  }

  const installed: string[] = [];
  const skippedExisting: string[] = [];
  const tmpRoot = await fs.mkdtemp(path.join(paths.rootDir, ".default-skills-"));

  try {
    opts.log?.(`Ensuring default global skills in ${paths.skillsDir}`);

    for (const skill of skills) {
      const finalDir = path.join(paths.skillsDir, skill.name);
      if (!opts.force && (await exists(finalDir))) {
        skippedExisting.push(skill.name);
        continue;
      }

      await fs.rm(finalDir, { recursive: true, force: true });
      const tmpDir = path.join(tmpRoot, skill.name);
      await downloadGitHubDirectory({
        fetchImpl,
        repo,
        ref,
        githubPath: skill.githubPath,
        destDir: tmpDir,
      });
      await fs.rename(tmpDir, finalDir);
      installed.push(skill.name);
    }

    const state: DefaultGlobalSkillsState = {
      version: INSTALL_STATE_VERSION,
      repo,
      ref,
      installedAt: new Date().toISOString(),
      skills: skills.map((skill) => skill.name),
    };
    await fs.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf-8");

    return {
      status: installed.length > 0 ? "installed" : "already_installed",
      skillsDir: paths.skillsDir,
      stateFile,
      installed,
      skippedExisting,
    };
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}
