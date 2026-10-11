/**
 * Goal 1 — a backend module for `@backstage-community/plugin-adr-backend` that registers an
 * adrkit-aware `AdrInfoParser` through `adrExtensionPoint.setAdrInfoParser`.
 *
 * Verified signature (node_modules/@backstage-community/plugin-adr-backend/dist/index.d.ts,
 * 0.26.1): `setAdrInfoParser(adrInfoParser: AdrInfoParser): void`, where
 * (plugin-adr-common 0.25.0) `type AdrInfoParser = (content: string, dateFormat?: string) => AdrInfo`
 * and `interface AdrInfo { title?: string; status?: string; date?: string }`.
 *
 * Constraints that shape this module (SPIKE.md):
 * - synchronous, content-only: the router calls `parser(fileContent.toString())` with no path
 *   and no dateFormat;
 * - `/list` runs the parser on every file in the tree, unfiltered (filtering happens in the
 *   frontend), so a non-record file must not throw;
 * - `AdrInfo` has no `id`. The router spreads `...adrInfo` into each `/list` row, so extra
 *   fields reach the JSON at runtime. We return `adrkitId` to *measure* that, but nothing in
 *   the design relies on it (gap G1).
 */
import { createBackendModule } from '@backstage/backend-plugin-api';
import { adrExtensionPoint } from '@backstage-community/plugin-adr-backend';
import type { AdrInfo, AdrInfoParser } from '@backstage-community/plugin-adr-common';
import { madrParser } from '@backstage-community/plugin-adr-common';
import { readAdrkitFields } from '../shared/adrkitFrontmatter';

/** What the parser actually returns: AdrInfo plus one undeclared field (see G1). */
interface AdrkitAdrInfo extends AdrInfo {
  adrkitId?: string;
}

export const adrkitAdrInfoParser: AdrInfoParser = (content, dateFormat) => {
  const fields = readAdrkitFields(content);
  if (!fields.isAdrkit) {
    // Not an adrkit record: defer to the plugin's own MADR parser, unchanged.
    return madrParser(content, dateFormat);
  }
  const info: AdrkitAdrInfo = {
    title: fields.title,
    status: fields.status,
    date: fields.date,
    adrkitId: fields.id,
  };
  return info;
};

export const adrModuleAdrkitParser = createBackendModule({
  pluginId: 'adr',
  moduleId: 'adrkit-info-parser',
  register(reg) {
    reg.registerInit({
      deps: { adr: adrExtensionPoint },
      async init({ adr }) {
        adr.setAdrInfoParser(adrkitAdrInfoParser);
      },
    });
  },
});
