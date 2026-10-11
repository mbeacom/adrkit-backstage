/**
 * Minimal new-backend-system host for the spike: catalog + adr + search (Lunr, in-memory)
 * + the community ADR collator + the three adrkit pieces under test.
 */
import { createBackend } from '@backstage/backend-defaults';
import { adrModuleAdrkitParser } from './adrInfoParserModule';
import { searchModuleAdrkitCollator } from './searchCollatorModule';
import { adrkitTier1Plugin } from './adrkitTier1Plugin';

const backend = createBackend();

backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(import('@backstage-community/plugin-adr-backend'));
backend.add(import('@backstage/plugin-search-backend'));
backend.add(import('@backstage-community/search-backend-module-adr'));

if (process.env.SPIKE_BASELINE !== '1') {
  backend.add(adrModuleAdrkitParser);
  backend.add(searchModuleAdrkitCollator);
}
backend.add(adrkitTier1Plugin);

backend.start();
