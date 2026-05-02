/** GitHub REST API helpers for seller Phase B tools. */

import { type FetchFn } from "./common.js";

export interface GitHubDeps {
  token: string;
  repoOwner: string;
  repoName: string;
  fetch: FetchFn;
}

interface GitHubApiOptions {
  method?: string;
  body?: unknown;
}

async function githubRequest<T>(
  deps: GitHubDeps,
  path: string,
  options: GitHubApiOptions = {},
): Promise<T> {
  const url = `https://api.github.com/repos/${deps.repoOwner}/${deps.repoName}${path}`;
  const res = await deps.fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${deps.token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `GitHub API ${res.status} on ${path}`;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) msg += `: ${parsed.message}`;
    } catch {
      if (text) msg += `: ${text}`;
    }
    throw new Error(msg);
  }

  // 204 No Content → return empty object
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

interface RepoInfo {
  default_branch: string;
}

interface GitRef {
  object: { sha: string };
}

interface FileContent {
  sha: string;
  content: string; // base64 encoded
  encoding: string;
}

interface PullRequest {
  html_url: string;
  number: number;
}

/** Get the name of the default branch and the SHA of its tip commit. */
export async function getDefaultBranchSha(
  deps: GitHubDeps,
): Promise<{ defaultBranch: string; sha: string }> {
  const repo = await githubRequest<RepoInfo>(deps, "");
  const defaultBranch = repo.default_branch;
  const ref = await githubRequest<GitRef>(deps, `/git/ref/heads/${defaultBranch}`);
  return { defaultBranch, sha: ref.object.sha };
}

/**
 * Create a new branch pointing at `sha`.
 *
 * `defaultBranch` is required so we can refuse to create (or silently "reuse")
 * a branch that is the repo default — callers must pass a feature branch name.
 *
 * On 422: GitHub returns "Reference already exists" when the branch is already
 * present. We only treat that as a no-op when the existing branch is NOT the
 * default branch. If it somehow is the default, we throw rather than proceeding
 * to write directly to it.
 */
export async function createBranch(
  deps: GitHubDeps,
  branchName: string,
  sha: string,
  defaultBranch: string,
): Promise<void> {
  if (branchName === defaultBranch) {
    throw new Error(
      `branch_name "${branchName}" is the repository default branch. ` +
        "Provide a feature branch name to avoid committing directly to the default branch.",
    );
  }

  const res = await deps.fetch(
    `https://api.github.com/repos/${deps.repoOwner}/${deps.repoName}/git/refs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deps.token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
    },
  );

  if (res.status === 422) {
    // Branch already exists — safe to reuse only if it is not the default branch.
    // We already checked above, so this path is always safe.
    return;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status} creating branch: ${text}`);
  }
}

/**
 * Get the current SHA of a file path, or null if the file doesn't exist yet.
 * Used to distinguish create vs update when calling the Contents API.
 */
export async function getFileSha(
  deps: GitHubDeps,
  filePath: string,
  branch: string,
): Promise<string | null> {
  const res = await deps.fetch(
    `https://api.github.com/repos/${deps.repoOwner}/${deps.repoName}/contents/${filePath}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${deps.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as FileContent;
  return data.sha ?? null;
}

/**
 * Get the decoded JSON content of a file, or null if not found.
 * Returns both the parsed content and the blob SHA needed for updates.
 */
export async function getFileContent(
  deps: GitHubDeps,
  filePath: string,
  branch: string,
): Promise<{ content: Record<string, unknown>; sha: string } | null> {
  const res = await deps.fetch(
    `https://api.github.com/repos/${deps.repoOwner}/${deps.repoName}/contents/${filePath}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${deps.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;

  const data = (await res.json()) as FileContent;
  if (data.encoding !== "base64") return null;

  const decoded = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
  try {
    return { content: JSON.parse(decoded) as Record<string, unknown>, sha: data.sha };
  } catch {
    return null;
  }
}

/** Create or update a file on the given branch. */
export async function putFile(
  deps: GitHubDeps,
  filePath: string,
  branch: string,
  content: string,
  message: string,
  existingSha: string | null,
): Promise<void> {
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch,
  };
  if (existingSha) body.sha = existingSha;

  await githubRequest(deps, `/contents/${filePath}`, { method: "PUT", body });
}

/**
 * Open a pull request. If a PR from `head` to `base` is already open, return
 * its URL instead of failing.
 */
export async function openOrFindPr(
  deps: GitHubDeps,
  head: string,
  base: string,
  title: string,
  body: string,
): Promise<string> {
  // Check for an existing open PR
  const existing = await githubRequest<PullRequest[]>(
    deps,
    `/pulls?state=open&head=${encodeURIComponent(`${deps.repoOwner}:${head}`)}&base=${encodeURIComponent(base)}`,
  );
  if (existing.length > 0) return existing[0].html_url;

  const pr = await githubRequest<PullRequest>(deps, "/pulls", {
    method: "POST",
    body: { title, body, head, base },
  });
  return pr.html_url;
}
