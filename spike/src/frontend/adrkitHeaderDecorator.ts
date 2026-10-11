/**
 * Goal 3 — a `contentDecorators` entry for `EntityAdrContent` that renders an adrkit header.
 *
 * Verified shape (node_modules/@backstage-community/plugin-adr/dist/index.d.ts, 0.31.0):
 *   type AdrContentDecorator = (adrInfo: { baseUrl: string; content: string; filename?: string })
 *     => { content: string };
 * It is a synchronous markdown -> markdown transform; `AdrReader` reduces the decorator list
 * over the raw file and renders the result with `MarkdownContent`. So the "header" is markdown,
 * not a React component (gap G5).
 *
 * Shows: status, supersedes / supersededBy, review approvals vs quorum, open objections.
 * Does NOT show: any readiness verdict, any review or ratifying command. Approvals and quorum
 * come from the Tier 1 route (`@adrkit/sdk` queue), never from counting `review.approvals`
 * here, because adrkit counts distinct identities under ASCII casefold (ADR-0051) and
 * restating that rule downstream is what ADR-0029 clause 8 forbids.
 */
import type { AdrContentDecorator } from '@backstage-community/plugin-adr';
import { readAdrkitFields } from '../shared/adrkitFrontmatter';

/** One row of the Tier 1 `/api/adrkit/queue` response. */
export interface ReviewState {
  id: string;
  path: string;
  slaState: string;
  approvalCount: number;
  quorum: number | null;
  unresolvedObjectionCount: number;
}

/** Same shape as plugin-adr-common's FRONT_MATTER_PATTERN; group 1 is the whole block. */
const FRONT_MATTER_BLOCK = /^(---\r?\n(?:.*\r?\n)*?---[^\S\r\n]*(?:\r?\n|$))/;

/** Markdown-escape untrusted record text placed in a table cell. */
function cell(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+!|<>]/g, m => `\\${m}`).replace(/\r?\n/g, ' ');
}

/**
 * @param reviewByFilename queue rows keyed by record filename (the `filename` the decorator is
 *   given is the entity-relative path, which is what the queue reports as `path`).
 * @param recordHref builds a link to another record by id, or returns undefined for plain text.
 */
export function createAdrkitHeaderDecorator(
  reviewByFilename: ReadonlyMap<string, ReviewState>,
  recordHref: (id: string) => string | undefined = () => undefined,
  options: { replaceFrontMatterTable?: boolean } = {},
): AdrContentDecorator {
  const ref = (id: string) => {
    const href = recordHref(id);
    return href ? `[ADR-${cell(id)}](${href})` : `ADR-${cell(id)}`;
  };
  return ({ content, filename }) => {
    const f = readAdrkitFields(content);
    if (!f.isAdrkit) return { content };
    const rows: Array<[string, string]> = [['Status', f.status ? cell(f.status) : '—']];
    if (f.supersedes.length) rows.push(['Supersedes', f.supersedes.map(ref).join(', ')]);
    if (f.supersededBy) rows.push(['Superseded by', ref(f.supersededBy)]);
    const review = filename ? reviewByFilename.get(filename) : undefined;
    if (review) {
      const quorum = review.quorum === null ? 'no quorum set' : `${review.quorum}`;
      rows.push(['Approvals', `${review.approvalCount} of ${quorum}`]);
      rows.push(['Open objections', `${review.unresolvedObjectionCount}`]);
      rows.push(['Review SLA', cell(review.slaState)]);
    }
    const header =
      `| adrkit | ADR-${cell(f.id ?? '?')} |\n|---|---|\n` +
      rows.map(([k, v]) => `| ${k} | ${v} |`).join('\n') +
      '\n\n';
    // Insert AFTER the frontmatter block, not before it: the community front-matter formatter
    // (which runs next) only recognizes frontmatter at the very start of the file (`^---`).
    // Prepending made it render the YAML as raw text — observed in the first spike run.
    const m = content.match(FRONT_MATTER_BLOCK);
    if (!m) return { content: header + content };
    // With replaceFrontMatterTable the caller drops the community formatter (which renders
    // adrkit's nested `review`/`provenance` maps as "[object Object]" and dates in the
    // viewer's local zone — finding F3), so the YAML block is removed here instead.
    if (options.replaceFrontMatterTable) return { content: header + content.slice(m[1].length) };
    return { content: m[1] + header + content.slice(m[1].length) };
  };
}
