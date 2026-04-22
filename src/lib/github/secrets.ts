/**
 * Thin wrapper around GitHub REST v3 for:
 *   • encrypting + upserting repo-level Actions secrets
 *   • dispatching a workflow run
 *
 * GitHub requires that secret values be encrypted client-side with the
 * repository's public key (libsodium sealed_box) before uploading, which
 * is why we depend on `libsodium-wrappers` rather than just PUTting
 * plaintext.
 *
 * All traffic is authenticated via a fine-grained PAT carried in the
 * `GITHUB_PAT` environment variable. The PAT needs:
 *   • Repository permissions → Secrets: Read/Write
 *   • Repository permissions → Actions: Read/Write (for workflow_dispatch)
 *   • Repository permissions → Contents: Read
 */
import sodium from "libsodium-wrappers";

const GITHUB_API = "https://api.github.com";

function env(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is not configured on the server.`);
  return v;
}

function repoSlug(): string {
  // Accept either "owner/repo" or a full URL for convenience.
  const raw = env("GITHUB_REPO");
  const m = raw.match(/([^/:]+\/[^/]+?)(?:\.git)?$/);
  if (!m) throw new Error(`GITHUB_REPO must be "owner/repo", got "${raw}".`);
  return m[1];
}

async function gh<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env("GITHUB_PAT")}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (res.status === 204) return undefined as unknown as T;
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const msg =
      (parsed && (parsed.message || parsed.error_description)) ||
      `GitHub API ${res.status}`;
    throw new Error(`${msg} (${path})`);
  }
  return parsed as T;
}

interface RepoPublicKey {
  key_id: string;
  key: string; // base64
}

async function getRepoPublicKey(): Promise<RepoPublicKey> {
  return gh<RepoPublicKey>(
    `/repos/${repoSlug()}/actions/secrets/public-key`,
    { method: "GET" },
  );
}

/**
 * Upsert a single repository-level secret. Idempotent — the GitHub API
 * returns 201 on create, 204 on update, both mean success.
 */
export async function setRepoSecret(name: string, value: string): Promise<void> {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
    throw new Error(`Secret name must be UPPER_SNAKE_CASE, got "${name}".`);
  }
  await sodium.ready;
  const publicKey = await getRepoPublicKey();

  const keyBytes = sodium.from_base64(
    publicKey.key,
    sodium.base64_variants.ORIGINAL,
  );
  const messageBytes = sodium.from_string(value);
  const encrypted = sodium.crypto_box_seal(messageBytes, keyBytes);
  const encrypted_value = sodium.to_base64(
    encrypted,
    sodium.base64_variants.ORIGINAL,
  );

  await gh(`/repos/${repoSlug()}/actions/secrets/${name}`, {
    method: "PUT",
    body: JSON.stringify({ encrypted_value, key_id: publicKey.key_id }),
  });
}

/**
 * Upsert many secrets sequentially. We deliberately serialise so a
 * mid-batch failure leaves the earlier secrets safely updated rather
 * than half-applied in a racy way.
 */
export async function setRepoSecrets(
  entries: Record<string, string | null | undefined>,
): Promise<{ updated: string[]; skipped: string[] }> {
  const updated: string[] = [];
  const skipped: string[] = [];
  for (const [name, value] of Object.entries(entries)) {
    if (!value) {
      skipped.push(name);
      continue;
    }
    await setRepoSecret(name, value);
    updated.push(name);
  }
  return { updated, skipped };
}

/**
 * Fire the given workflow on the default branch (or a provided ref).
 * Requires that the workflow YAML declares `on: workflow_dispatch:`.
 */
export async function dispatchWorkflow(
  workflowFile: string,
  ref = "main",
): Promise<void> {
  await gh(
    `/repos/${repoSlug()}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`,
    {
      method: "POST",
      body: JSON.stringify({ ref }),
    },
  );
}

/**
 * Latest run of the given workflow — used by the UI right after dispatch
 * to show the user a "run started" link.
 */
export async function getLatestWorkflowRun(
  workflowFile: string,
): Promise<{ id: number; html_url: string; status: string } | null> {
  interface RunListResponse {
    workflow_runs: Array<{ id: number; html_url: string; status: string }>;
  }
  const res = await gh<RunListResponse>(
    `/repos/${repoSlug()}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?per_page=1`,
    { method: "GET" },
  );
  return res.workflow_runs?.[0] ?? null;
}
