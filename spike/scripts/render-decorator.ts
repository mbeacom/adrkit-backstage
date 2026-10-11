/**
 * Headless evidence for goal 3: run the exact decorator chain `AdrkitEntityAdrContent` passes to
 * `EntityAdrContent` (adrkit header + the plugin's link/embed defaults, reduced in the same order as
 * `AdrReader`), over (a) the fixture corpus with review state and (b) real adrkit records.
 *
 * Review state comes from `@adrkit/sdk` `openDecisions(...).queue()` — the same call the Tier 1
 * route makes — so the header shows adrkit's distinct-identity approval count.
 *
 * Then renders the decorated markdown with react-markdown + remark-gfm (what `MarkdownContent`
 * wraps) via react-dom/server, to show the header survives GFM rendering.
 *
 * The real adrkit records are read from a local adrkit corpus directory, taken from (in order)
 * the first CLI argument, the ADRKIT_CORPUS environment variable, or `../../adrkit/docs/adr`
 * relative to this spike directory (an adrkit checkout beside this repository):
 *
 *   npm run decorator -- /path/to/adrkit/docs/adr
 *   ADRKIT_CORPUS=/path/to/adrkit/docs/adr npm run decorator
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
import { openDecisions } from '@adrkit/sdk/src/index.ts';
import { createAdrkitHeaderDecorator, type ReviewState } from '../src/frontend/adrkitHeaderDecorator';

async function main() {
  // Import the plugin's decorator factories from its built ESM module (the same object exposed
  // publicly as `AdrReader.decorators`), without pulling the whole React component tree.
  const root = join(__dirname, '..');
  const adrkitCorpus = resolve(process.argv[2] ?? process.env.ADRKIT_CORPUS ?? join(root, '..', '..', 'adrkit', 'docs', 'adr'));
  // Not in the package's `exports`, so import the built file by path.
  const { adrDecoratorFactories } = await import(
    pathToFileURL(join(root, 'node_modules/@backstage-community/plugin-adr/dist/components/AdrReader/decorators.esm.js')).href
  );
  const out: string[] = [];
  const cases: Array<[string, string]> = [
    [join(root, 'fixtures/review-corpus'), '0100-spike-fixture-proposed-record-with-review-state.md'],
    [join(root, 'fixtures/review-corpus'), '0098-spike-fixture-superseded-record.md'],
    [adrkitCorpus, '0021-resolve-inbound-source-annotations-without-changing-the-schema.md'],
    [adrkitCorpus, '0051-record-review-state-with-adr-approve-adr-object-and-adr-resolve.md'],
  ];
  // Review state from the published CLI JSON (@adrkit/cli 0.19.0), the route the Tier 1 plugin
  // defaults to. The SDK figure is recorded beside it: through the `file:` link it runs the
  // adrkit checkout's prebuilt core dist, which can predate the source (finding F5).
  const sets = new Map<string, Map<string, ReviewState>>();
  const compare: string[] = [];
  for (const [dir] of cases) {
    if (sets.has(dir)) continue;
    const { stdout } = await run(join(root, 'node_modules/.bin/adr'), ['queue', '--format', 'json', '--dir', '.', '--as-of', '2026-10-10'], { cwd: dir });
    const items = (JSON.parse(stdout).items as any[]).map(i => ({ ...i, path: i.sourcePath }) as ReviewState);
    sets.set(dir, new Map(items.map(e => [e.path, e])));
    const set = await openDecisions({ cwd: dir, dir: '.' });
    const sdk = new Map(set.queue({ asOf: '2026-10-10' }).entries.map(e => [e.id, e.approvalCount]));
    for (const i of items) compare.push(`| ${i.id} | ${i.approvalCount} | ${sdk.get(i.id)} |`);
  }
  const { renderToStaticMarkup } = await import('react-dom/server');
  const React = await import('react');
  // `MarkdownContent` itself cannot load under plain Node ESM (core-components imports .svg
  // assets), so render with the same libraries it wraps: react-markdown 8 + remark-gfm 3
  // (the versions installed under @backstage/core-components 0.18.14).
  const ReactMarkdown = (await import('react-markdown')).default;
  const remarkGfm = (await import('remark-gfm')).default;
  for (const [dir, file] of cases) {
    const decorators = [
      createAdrkitHeaderDecorator(sets.get(dir)!, id => `?record=${id}`, { replaceFrontMatterTable: !process.env.KEEP_FM_TABLE }),
      adrDecoratorFactories.createRewriteRelativeLinksDecorator(),
      adrDecoratorFactories.createRewriteRelativeEmbedsDecorator(),
      ...(process.env.KEEP_FM_TABLE ? [adrDecoratorFactories.createFrontMatterFormatterDecorator()] : []),
    ];
    const raw = readFileSync(join(dir, file), 'utf8');
    const baseUrl = 'https://github.com/mbeacom/adrkit/tree/8da6a09/docs/adr';
    const md = decorators.reduce((c: string, d: any) => d({ baseUrl, content: c, filename: file }).content, raw);
    const head = md.split('\n').slice(0, 8).join('\n');
    let html = '';
    try {
      html = renderToStaticMarkup(React.createElement(ReactMarkdown as any, { remarkPlugins: [remarkGfm] }, md));
    } catch (e) {
      html = `RENDER FAILED: ${(e as Error).message}`;
    }
    const table = html.match(/<table>[\s\S]*?<\/table>/)?.[0] ?? '(no table)';
    out.push(`## ${file}\n\n### decorated markdown (first 8 lines)\n\n\`\`\`markdown\n${head}\n\`\`\`\n\n### first <table> rendered by react-markdown 8 + remark-gfm 3 (MarkdownContent's renderer)\n\n\`\`\`html\n${table}\n\`\`\`\n`);
  }
  const target = join(root, 'evidence/decorator-output.md');
  const cmp = `## approvalCount: CLI 0.19.0 vs SDK (file: link)\n\n| id | CLI | SDK |\n|---|---|---|\n${compare.join('\n')}\n`;
  writeFileSync(target, `# Decorator evidence (generated by scripts/render-decorator.ts)\n\n${cmp}\n${out.join('\n')}`);
  console.log(`wrote ${target}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
