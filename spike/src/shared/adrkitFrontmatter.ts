/**
 * Per-file projection of adrkit frontmatter, shared by the backend list parser, the search
 * collator parser, and the frontend header decorator.
 *
 * YAML is parsed by the community plugin's own public `parseMadrWithFrontmatter`
 * (`@backstage-community/plugin-adr-common`), so this file adds no YAML dependency and no
 * second YAML dialect. What it does is *field selection*: it reads stored frontmatter
 * fields (id, title, status, date, supersedes, supersededBy, tags). It computes nothing
 * that adrkit's kernels compute (no approval counting, no status bucketing, no queue, no
 * `affects` matching) — those come from `@adrkit/sdk` through the Tier 1 backend plugin.
 *
 * Why not the SDK here: every extension point that sees a single file is either
 * synchronous (`AdrInfoParser`) or per-file (`AdrParser`), and `@adrkit/sdk` exposes only a
 * directory-level, async, filesystem I/O door (`openDecisions`). There is no SDK entry point
 * for "parse this one record's text". See SPIKE.md, gap G3.
 */
import { parseMadrWithFrontmatter } from '@backstage-community/plugin-adr-common';

export interface AdrkitRecordFields {
  id?: string;
  title?: string;
  status?: string;
  date?: string;
  supersedes: string[];
  supersededBy?: string;
  tags: string[];
  /** True when the file carried adrkit frontmatter (`schemaVersion` + `id`). */
  isAdrkit: boolean;
}

/**
 * adrkit's corpus filename rule, restated: `^[0-9]{4,}-.+\.md$` on the basename, excluding
 * `0000-template.md` (`@adrkit/core` `isRecordFileName`). Neither the SDK nor the CLI JSON
 * exposes this predicate, so restating it is gap G4.
 *
 * The community default (`madrFilePathFilter`, `/^(?:.*\/)?\d{4}-.+\.md$/`) differs in two
 * ways: it admits `0000-template.md`, and it rejects 5+ digit ids.
 */
export function isAdrkitRecordPath(path: string): boolean {
  const base = path.slice(path.lastIndexOf('/') + 1);
  return base !== '0000-template.md' && /^[0-9]{4,}-.+\.md$/.test(base);
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) {
    // The plugin's YAML schema includes the timestamp tag, so a bare `date: 2026-08-15`
    // arrives as a Date at UTC midnight. Format it in UTC. (The community default parser
    // formats it in the *server's local* zone, which yields the previous day west of UTC —
    // SPIKE.md finding F2.)
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(v => asString(v)).filter((v): v is string => !!v);
  const one = asString(value);
  return one ? [one] : [];
}

export function readAdrkitFields(content: string): AdrkitRecordFields {
  const { attributes } = parseMadrWithFrontmatter(content);
  const a = attributes as Record<string, unknown>;
  return {
    id: asString(a.id),
    title: asString(a.title),
    status: asString(a.status),
    date: asString(a.date),
    supersedes: asStringList(a.supersedes),
    supersededBy: asString(a.supersededBy),
    tags: asStringList(a.tags),
    isAdrkit: a.schemaVersion !== undefined && a.id !== undefined,
  };
}
