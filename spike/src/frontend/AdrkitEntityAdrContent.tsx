/**
 * Wrapper around the community `EntityAdrContent` that (1) fetches review state from the Tier 1
 * backend route once, (2) builds the adrkit header decorator over it, and (3) passes it through
 * the public `contentDecorators` / `filePathFilterFn` props.
 *
 * Decorators are synchronous, so async review state has to be fetched *outside* them and closed
 * over. Passing `contentDecorators` REPLACES the plugin's three defaults, so they are re-added
 * from `AdrReader.decorators` (gap G6), except the front-matter table, which the adrkit header
 * replaces (finding F3).
 *
 * The NFS (`/alpha`) entity-content extension takes no decorator config, so New Frontend System
 * apps must override the extension's loader (bottom of file) (gap G7).
 */
import { useMemo } from 'react';
import useAsync from 'react-use/esm/useAsync';
import {
  AdrReader,
  EntityAdrContent,
} from '@backstage-community/plugin-adr';
import { adrEntityContentExtension } from '@backstage-community/plugin-adr/alpha';
import { getAdrLocationUrl } from '@backstage-community/plugin-adr-common';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { scmIntegrationsApiRef } from '@backstage/integration-react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { isAdrkitRecordPath } from '../shared/adrkitFrontmatter';
import { createAdrkitHeaderDecorator, type ReviewState } from './adrkitHeaderDecorator';

export function AdrkitEntityAdrContent() {
  const { entity } = useEntity();
  const scm = useApi(scmIntegrationsApiRef);
  const discovery = useApi(discoveryApiRef);
  const { fetch } = useApi(fetchApiRef);

  const { value: review } = useAsync(async () => {
    const corpusUrl = getAdrLocationUrl(entity, scm);
    const base = await discovery.getBaseUrl('adrkit');
    const res = await fetch(`${base}/queue?url=${encodeURIComponent(corpusUrl)}`);
    if (!res.ok) return new Map<string, ReviewState>();
    const body = (await res.json()) as { entries: ReviewState[] };
    return new Map(body.entries.map(e => [e.path, e]));
  }, [entity, scm]);

  const decorators = useMemo(
    () => [
      createAdrkitHeaderDecorator(review ?? new Map(), undefined, { replaceFrontMatterTable: true }),
      AdrReader.decorators.createRewriteRelativeLinksDecorator(),
      AdrReader.decorators.createRewriteRelativeEmbedsDecorator(),
      // createFrontMatterFormatterDecorator() deliberately omitted: the adrkit header replaces it (F3).
    ],
    [review],
  );

  return <EntityAdrContent contentDecorators={decorators} filePathFilterFn={isAdrkitRecordPath} />;
}

/** New Frontend System: swap the community extension's loader for the wrapper. */
export const adrkitAdrEntityContentOverride = adrEntityContentExtension.override({
  params: {
    loader: async () => <AdrkitEntityAdrContent />,
  },
});
