/**
 * Goal 2 — a search module that customizes `@backstage-community/search-backend-module-adr`
 * through `adrsCollatorExtensionPoint`.
 *
 * Verified signatures (node_modules/@backstage-community/search-backend-module-adr/dist/index.d.ts,
 * 0.23.1):
 *   setAdrFilePathFilter(filePathFilterFn: AdrFilePathFilterFn): void   // (path: string) => boolean
 *   setAdrParser(adrParser: AdrParser): void   // (ctx: { entity, content, path }) => Promise<AdrDocument>
 * Both throw if called twice ("can only be called once").
 *
 * The parser here is async and sees the path, unlike the list parser.
 */
import { createBackendModule } from '@backstage/backend-plugin-api';
import { adrsCollatorExtensionPoint } from '@backstage-community/search-backend-module-adr';
import {
  createMadrParser,
  type AdrDocument,
  type AdrParser,
} from '@backstage-community/plugin-adr-common';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { isAdrkitRecordPath, readAdrkitFields } from '../shared/adrkitFrontmatter';

/** AdrDocument plus adrkit fields. Space-joined strings so the Lunr engine tokenizes them. */
export interface AdrkitAdrDocument extends AdrDocument {
  adrkitId: string;
  supersedes: string;
  supersededBy: string;
  tags: string;
}

const madrFallback = createMadrParser();

export const adrkitAdrParser: AdrParser = async ctx => {
  const fields = readAdrkitFields(ctx.content);
  if (!fields.isAdrkit) return madrFallback(ctx);
  const { entity, path, content } = ctx;
  const doc: AdrkitAdrDocument = {
    title: fields.id ? `ADR-${fields.id}: ${fields.title ?? path}` : fields.title ?? path,
    text: content,
    status: fields.status,
    date: fields.date,
    entityRef: stringifyEntityRef(entity),
    entityTitle: entity.metadata.title,
    // Same template as the community default (DEFAULT_LOCATION_TEMPLATE), lower-cased like it.
    location: `/catalog/${entity.metadata.namespace ?? 'default'}/${entity.kind}/${entity.metadata.name}/adrs?record=${path}`.toLocaleLowerCase('en-US'),
    adrkitId: fields.id ?? '',
    supersedes: fields.supersedes.join(' '),
    supersededBy: fields.supersededBy ?? '',
    tags: fields.tags.join(' '),
  };
  return doc;
};

export const searchModuleAdrkitCollator = createBackendModule({
  pluginId: 'search',
  moduleId: 'adrkit-adr-collator-customization',
  register(reg) {
    reg.registerInit({
      deps: { collator: adrsCollatorExtensionPoint },
      async init({ collator }) {
        collator.setAdrFilePathFilter(isAdrkitRecordPath);
        collator.setAdrParser(adrkitAdrParser);
      },
    });
  },
});
