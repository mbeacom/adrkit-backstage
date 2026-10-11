/**
 * Goal 5 probe — a minimal Tier 1 backend plugin (`pluginId: 'adrkit'`) exposing ONE read-only
 * route: the ARB queue (approvals vs quorum, SLA state) for an explicitly supplied corpus URL.
 *
 * Why it exists: the community plugin's extension points are per-file string transforms. The
 * queue's `approvalCount` counts DISTINCT identities under ASCII casefold (`@adrkit/core`
 * `schema/identity.ts`); a decorator reading `review.approvals` would have to reimplement that
 * rule, which ADR-0029 clause 8 forbids. So the frontend header asks this route instead.
 *
 * Corpus access goes through Backstage's `UrlReaderService` (`readTree` -> `dir()`), which
 * enforces the integration allowlist, then hands a local directory to adrkit.
 *
 * Two adrkit consumption routes, selectable with `?via=`:
 *   - `cli` (default): the published `@adrkit/cli@0.19.0` `adr queue --format json` (the
 *     documented CLI JSON contract, ADR-0031 clause 5).
 *   - `sdk`: `@adrkit/sdk` `openDecisions` via a `file:` link to the adrkit checkout (unpublished,
 *     ADR-0053). Imported by deep path because the package has no `exports`/`main`. NOT the
 *     default: through the link it executes whatever `packages/core/dist` the checkout last
 *     built, which in this spike predated ADR-0051's distinct-identity count (finding F5).
 *
 * No write routes and no readiness verdict. The corpus URL is the entity's `backstage.io/adr-location`
 * annotation, the clause 9 document layer's input (Tier 1). No entity-to-path ownership mapping is
 * read and `governing()` is not exposed (Tier 2 stays out).
 */
import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { coreServices, createBackendPlugin } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import { openDecisions } from '@adrkit/sdk/src/index.ts';

const run = promisify(execFile);
const ADR_BIN = join(__dirname, '..', '..', 'node_modules', '.bin', 'adr');

export interface Tier1QueueRow {
  id: string;
  title: string;
  path: string;
  slaState: string;
  approvalCount: number;
  quorum: number | null;
  unresolvedObjectionCount: number;
}

async function queueViaSdk(dir: string, asOf?: string): Promise<Tier1QueueRow[]> {
  const set = await openDecisions({ cwd: dir, dir: '.' });
  return set.queue({ asOf }).entries.map(e => ({
    id: e.id,
    title: e.title,
    path: e.path,
    slaState: e.slaState,
    approvalCount: e.approvalCount,
    quorum: e.quorum,
    unresolvedObjectionCount: e.unresolvedObjectionCount,
  }));
}

async function queueViaCli(dir: string, asOf?: string): Promise<Tier1QueueRow[]> {
  const args = ['queue', '--format', 'json', '--dir', '.'];
  if (asOf) args.push('--as-of', asOf);
  let stdout: string;
  try {
    ({ stdout } = await run(ADR_BIN, args, { cwd: dir, maxBuffer: 16 * 1024 * 1024 }));
  } catch (error: any) {
    // Exit 1 = report emitted with corpus error findings; stdout is still the full report.
    if (error?.code === 1 && error.stdout) stdout = error.stdout;
    else throw error;
  }
  const report = JSON.parse(stdout) as { items: any[] };
  return report.items.map(i => ({
    id: i.id,
    title: i.title,
    path: i.sourcePath,
    slaState: i.slaState,
    approvalCount: i.approvalCount,
    quorum: i.quorum ?? null,
    unresolvedObjectionCount: i.unresolvedObjectionCount,
  }));
}

export const adrkitTier1Plugin = createBackendPlugin({
  pluginId: 'adrkit',
  register(env) {
    env.registerInit({
      deps: {
        reader: coreServices.urlReader,
        logger: coreServices.logger,
        httpRouter: coreServices.httpRouter,
      },
      async init({ reader, logger, httpRouter }) {
        const router = Router();
        router.use(express.json());
        router.get('/queue', async (req, res) => {
          const url = req.query.url;
          if (typeof url !== 'string' || !url) throw new InputError('url is required');
          const via = req.query.via === 'sdk' ? 'sdk' : 'cli';
          const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : undefined;
          const tree = await reader.readTree(url);
          const dir = await tree.dir();
          try {
            const entries = via === 'cli' ? await queueViaCli(dir, asOf) : await queueViaSdk(dir, asOf);
            logger.info(`queue via ${via}: ${entries.length} entries from ${url}`);
            res.json({ via, url, etag: tree.etag, entries });
          } finally {
            await rm(dir, { recursive: true, force: true });
          }
        });
        httpRouter.use(router);
      },
    });
  },
});
