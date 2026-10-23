import type { UpdateChannel } from './buildInfo.ts';

export interface CachedRelease {
  tag: string;
  changelog: string;
}

export interface ChangelogCache {
  releases: Partial<Record<UpdateChannel, CachedRelease>>;
  full?: string;
}

const EMPTY: ChangelogCache = { releases: {} };

/** The stored cache; anything missing or unreadable counts as an empty one. */
export function parseChangelogCache(raw: string | null): ChangelogCache {
  if (raw === null) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'releases' in parsed && parsed.releases && typeof parsed.releases === 'object') {
      return parsed as ChangelogCache;
    }
  } catch {
    // A corrupt entry is replaced by the next successful check.
  }
  return EMPTY;
}

/** The notes of the last release seen on this channel, or null when that release was never cached. */
export function cachedChangelogOf(cache: ChangelogCache, channel: UpdateChannel): string | null {
  const entry = cache.releases[channel];
  return typeof entry?.changelog === 'string' ? entry.changelog : null;
}
