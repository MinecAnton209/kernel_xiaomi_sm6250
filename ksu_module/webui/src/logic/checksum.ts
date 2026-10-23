const SHA256_RE = /^[0-9a-f]{64}$/;

/** A SHA-256 as 64 lower case hex digits, or an empty string for anything else. */
export function normalizeSha256(value: string | null | undefined): string {
  const lower = (value ?? '').trim().toLowerCase();
  return SHA256_RE.test(lower) ? lower : '';
}

/** The SHA-256 in the `digest` field the GitHub API gives a release asset (`sha256:<hex>`). */
export function digestToSha256(digest: string | null | undefined): string {
  const match = /^sha256:(.+)$/i.exec((digest ?? '').trim());
  return normalizeSha256(match?.[1]);
}

export interface ResolvedChecksum {
  sha256: string;
  /** True when the manifest and GitHub both gave a checksum and they differ. */
  conflict: boolean;
}

/**
 * Picks the checksum to trust for an asset: only the digest GitHub computed when the file was uploaded.
 * The manifest our CI wrote is only checked against it; a file GitHub gives no digest for has no
 * checksum to trust, so it is not downloaded. When both exist and differ, one of them is wrong.
 */
export function resolveSha256(manifestSha: string | null | undefined, digest: string | null | undefined): ResolvedChecksum {
  const fromManifest = normalizeSha256(manifestSha);
  const fromGithub = digestToSha256(digest);
  if (fromManifest !== '' && fromGithub !== '' && fromManifest !== fromGithub) {
    return { sha256: '', conflict: true };
  }
  return { sha256: fromGithub, conflict: false };
}
