# Spike: extending `@backstage-community/plugin-adr` for adrkit

Issue [mbeacom/adrkit#298](https://github.com/mbeacom/adrkit/issues/298), ADR-0029 action item 5
(clause 9). Run on 2026-10-10 in a local repository, and later imported unchanged in substance
into `spike/` of [mbeacom/adrkit-backstage](https://github.com/mbeacom/adrkit-backstage). It is
unpublished. It is **ADR-0014 rung 1 evidence only**: it authorizes no release, and no
document-layer package should pin a version until a record cites this spike.

> **Warning: `app-config.yaml` sets `backend.auth.dangerouslyDisableDefaultAuthPolicy: true`.**
> That makes every plugin route on the spike backend reachable without a Backstage token (F4).
> It exists only so curl could capture evidence. Never copy it into a package, a dev harness,
> or any real Backstage configuration; it must not appear anywhere outside `spike/`.

> **Changes made on import.** The evidence logs were path-scrubbed: the absolute local path on
> each log's config line is replaced with `<repo>/app-config.yaml`, where `<repo>` is this
> `spike/` directory. Nothing else in `evidence/` changed. `scripts/render-decorator.ts` now takes
> the adrkit corpus directory from its first argument or `ADRKIT_CORPUS`, defaulting to
> `../../adrkit/docs/adr`, instead of a hard-coded absolute path. The `@adrkit/sdk` `file:` link
> moved from `../adrkit/packages/sdk` to `../../adrkit/packages/sdk` (in `package.json` and
> `package-lock.json`) so it still resolves to an adrkit checkout beside this repository.
> `tsconfig.ci.json` is new; see Reproduce.

**Result: the extension points are enough for the document layer.** All five goals pass at the
pinned versions, with gaps listed below. Rendering does not need reimplementing. Review state
(approvals vs quorum) cannot come through the community plugin's types, so **Tier 1 needs its
own small backend plugin**, and a wrapper component has to pass its data into the decorator.

## Versions (pinned exactly in `package.json` / `package-lock.json`)

| Package | Version |
|---|---|
| `@backstage-community/plugin-adr` | **0.31.0** |
| `@backstage-community/plugin-adr-backend` | **0.26.1** |
| `@backstage-community/plugin-adr-common` | **0.25.0** |
| `@backstage-community/search-backend-module-adr` | **0.23.1** |
| `@backstage/backend-defaults` | 0.18.0 |
| `@backstage/backend-plugin-api` | 1.10.1 (one copy, deduped) |
| `@backstage/plugin-catalog-backend` | 4.0.0 |
| `@backstage/plugin-search-backend` / `-node` | 2.1.7 / 1.4.8 |
| `@backstage/frontend-plugin-api` (transitive) | 0.18.1 |
| `@adrkit/cli` (published) | 0.19.0 |
| `@adrkit/sdk` | `file:` link to `adrkit@8da6a09` `packages/sdk` (unpublished, 0.0.0) |
| Node / npm / TypeScript / tsx | 22.22.2 / 10.9.7 / 5.9.3 / 4.23.15 |

Corpus: `https://github.com/mbeacom/adrkit/tree/8da6a0982cad68b91dcb34e986c4c26071ab9dba/docs/adr`,
read through `UrlReaderService` without authentication. Pinning to a commit SHA works for
`readTree`, and the ETag is that SHA.

**Verified range: exactly the four community versions above.** That is one point, not a range.
Treat the upper edge as a verification boundary in the ADR-0019 sense: widening it means
re-verifying.

Host: a minimal new-backend-system process (`src/backend/index.ts`, run with `tsx`) with catalog,
adr, search (in-memory Lunr), and the community ADR collator. I used no `create-app`: this
machine has no `yarn`, and ADR-0030 already measured that tree. npm 10 installed everything, with
one peer conflict: `backend-defaults` wants `better-sqlite3@^12`, and 13 is current. The install
has 1,294 lockfile entries and a 947 MB `node_modules`, with install scripts in `better-sqlite3`,
`esbuild`, `keytar`, `protobufjs`, `core-js`, and `fsevents`. That is consistent with ADR-0030's
reason for keeping this out of the adrkit workspace.

## Results

### 1. `adrExtensionPoint.setAdrInfoParser`: PASS

The signature, verified in `node_modules/@backstage-community/plugin-adr-backend/dist/index.d.ts`,
is `setAdrInfoParser(adrInfoParser: AdrInfoParser): void`. `AdrInfoParser` is
`(content: string, dateFormat?: string) => AdrInfo`, and `AdrInfo` is
`{ title?, status?, date? }` (`plugin-adr-common/dist/index.d.ts`).

The module is `src/backend/adrInfoParserModule.ts`, registered as `pluginId: 'adr'`. Evidence is in
`evidence/adrkit-list.json`, from `GET /api/adr/list`, which returned 60 rows. For 0029 it returns
`title` without the `ADR-0029:` prefix, `status: accepted`, `date: 2026-08-15`, and `adrkitId: "0029"`.

For comparison, the community default MADR parser (`evidence/baseline-community-list.json`, run
with `SPIKE_BASELINE=1`) also reads status from frontmatter and takes the title from the H1 heading.
At first glance it looks acceptable, but it gets the **date wrong** (F2), so it is not good enough.

### 2. `adrsCollatorExtensionPoint.setAdrParser` + `setAdrFilePathFilter`: PASS

Both signatures match the `.d.ts`, and both throw if called twice. The module is
`src/backend/searchCollatorModule.ts`, registered as `pluginId: 'search'`. It consumes an extension
point that another module of the same plugin registers, and that works.

The log shows `Indexed 59 ADRs`; the baseline indexed 60, because it includes `0000-template.md`.
The documents come back from `/api/search/query` carrying `adrkitId`, `supersedes`,
`supersededBy`, and `tags`, and **`filters[...]` matches on them**:

| query | result | evidence |
|---|---|---|
| `filters[supersededBy]=0022` | `["0021"]` | `search-filter-supersededBy-0022.json` |
| `filters[supersedes]=0021` | `["0022"]` | `search-filter-supersedes-0021.json` |
| `filters[status]=superseded` | `["0005","0021"]` | `search-filter-status-superseded.json` |
| `filters[tags]=catalog` | 6 records | `search-filter-tags-catalog.json` |

`term=supersededBy:0022` field syntax is **not** honored, because Backstage's Lunr translator
fuzz-matches the whole term. Use `filters`.

### 3. Frontend `contentDecorators` header: PASS (headless), unverified in a running app

`AdrContentDecorator` is `({ baseUrl, content, filename? }) => { content: string }`
(`plugin-adr/dist/index.d.ts`). The code is in `src/frontend/adrkitHeaderDecorator.ts` and
`src/frontend/AdrkitEntityAdrContent.tsx`. The wrapper fetches the Tier 1 queue once, builds the
decorator over it, and passes `contentDecorators` + `filePathFilterFn` to `EntityAdrContent`. The
same file has a New Frontend System override, `adrEntityContentExtension.override({ params: { loader } })`.

All of it typechecks against the 0.31.0 `.d.ts` (`npm run typecheck`).

`scripts/render-decorator.ts` runs the same decorator chain over real records and fixtures. It
renders the result with react-markdown 8 + remark-gfm 3, the libraries `MarkdownContent` wraps.
`MarkdownContent` itself cannot load under plain Node ESM because of its `.svg` imports. Output is
in `evidence/decorator-output.md`. Fixture 0100 has `approvals: ["@bob", "@Bob"]` and quorum 2, and
renders **"Approvals | 1 of 2"**. A superseded record links its successor. The header shows no
verdict and no review or ratify command.

I did not render a real Backstage frontend in a browser.

### 4. End-to-end against an annotated entity: PASS (backend)

The entity is `catalog/adrkit-component.yaml`, with `backstage.io/adr-location` set to the pinned
GitHub URL. Evidence:

- `adrkit-list.json` (`/api/adr/list`)
- `adrkit-file-0022.json` (`/api/adr/file`)
- the `search-filter-*.json` files
- `tier1-queue-{cli,sdk}.json` (`/api/adrkit/queue`, 7 entries, identical on this corpus)
- `backend-run*.log`

### 5. Range, gaps, Tier 1

The verified range is the single point above. The gaps:

- **G1. `AdrInfo` cannot carry adrkit fields.** It has no `id`, no supersession, and no review
  state. Extra fields reach `/list` only because the router spreads `...adrInfo`, which is
  undocumented, and `AdrFileInfo` does not declare them. Do not build on that.
- **G2. `AdrInfoParser` is synchronous and sees only the content.** It gets no path, and the
  router passes no `dateFormat`. `/list` runs it on every file in the tree, unfiltered; filtering
  happens client-side. `setAdrInfoParser` silently keeps the last call, unlike the collator setters.
- **G3. `@adrkit/sdk` has no per-record entry point.** `openDecisions` is directory-level,
  async, and filesystem-only, so the per-file hooks have to select fields from frontmatter
  themselves. The spike uses the plugin's own `parseMadrWithFrontmatter` and computes nothing.
- **G4. Neither the SDK nor the CLI JSON exposes adrkit's record-filename rule**
  (`^[0-9]{4,}-.+\.md$`, excluding `0000-template.md`), so the spike restates it. The community
  default admits the template and rejects 5+ digit ids.
- **G5. A decorator is a synchronous markdown-to-markdown transform.** The header can only be
  markdown, and async data has to be fetched outside it and closed over.
- **G6. Passing `contentDecorators` replaces the three defaults.** They have to be re-added from
  `AdrReader.decorators`.
- **G7. The NFS `entity-content:adr` extension accepts no decorator or filter config.**
  Customizing it means overriding its loader.

Findings:

- **F1. Header placement.** Prepending the header ahead of frontmatter broke the community
  frontmatter formatter (`^---`), which then printed the YAML raw. The header now goes after the
  frontmatter block.
- **F2. Off-by-one dates (upstream bug).** `parseMadrWithFrontmatter`/`madrParser` format a YAML
  timestamp in the server's local zone. In America/New_York, 0029 (`2026-08-15`) shows as
  `2026-08-14` (baseline list; reproduced with `TZ=UTC` vs `TZ=America/New_York`). The
  frontmatter-table decorator does the same in the viewer's zone. This is worth reporting upstream.
- **F3. The community frontmatter table mangles adrkit records.** It renders `review` and
  `provenance` as `[object Object]` (`decorator-output-with-community-frontmatter-formatter.md`).
  The adrkit header replaces it.
- **F4. Auth.** Calling routes with curl needed
  `backend.auth.dangerouslyDisableDefaultAuthPolicy: true`. That is spike-only, and it must not
  be carried into any package or harness (see the warning at the top of this file).
- **F5. The `file:` SDK route is not a valid consumption path.** It installs, and runs under
  Node 22.22's type stripping when imported by deep path (`@adrkit/sdk/src/index.ts`; the package
  has no `exports`/`main`). But `@adrkit/core` then resolves to the checkout's **prebuilt
  `packages/core/dist`**, which was dated Sep 22 and predates ADR-0051: `dist/index.js:2901`
  counts `review?.approvals?.length`, while source `src/queue/kernel.ts:170` uses
  `distinctIdentityCount(...)`. For fixture 0100 the SDK
  reported `approvalCount` **2** where `@adrkit/cli@0.19.0` reported **1**. The Tier 1 route
  therefore defaults to `?via=cli`. This is direct evidence for ADR-0053's publication record: a
  consumer needs a published, built SDK.

**Does Tier 1 need its own backend plugin? Yes.** It needs approvals, quorum, and objections with
adrkit's distinct-identity counting (ADR-0029 clause 8 forbids restating that in a decorator),
along with the queue, the graph, and governance for a supplied path. None of the community
extension points can carry these. The spike's `src/backend/adrkitTier1Plugin.ts` shows the shape:
one read-only GET that reads the corpus through UrlReader (`readTree`, then `dir()`), runs adrkit,
and returns JSON. It has no write routes. The corpus URL comes from the entity's
`backstage.io/adr-location` annotation, which is the input to the clause 9 document layer (Tier 1).
The spike reads no entity-to-path ownership mapping and exposes no `governing()` (Tier 2).

## Recommended layout for the real repository

The repository holds Backstage-only packages. Nothing goes into the adrkit workspace (ADR-0030).

```text
plugins/
  adrkit-backend/                       # Tier 1 backend plugin (pluginId 'adrkit'): queue, graph, and
                                        #   governing() only for a path a person typed or configured,
                                        #   never one derived from an entity (clause 1); UrlReader -> @adrkit/sdk
  adr-backend-module-adrkit/            # pluginId 'adr': setAdrInfoParser
  search-backend-module-adrkit/         # pluginId 'search': setAdrParser + setAdrFilePathFilter
  adrkit/                               # frontend: header decorator, AdrkitEntityAdrContent wrapper,
                                        #   NFS override, queue/graph pages calling adrkit-backend
  adrkit-common/                        # shared types + frontmatter field selection (until the SDK has G3/G4)
packages/backend, packages/app          # dev harness only, never published
```

Pin the four community packages to the verified point, and widen only after re-verifying. Depend
on a **published** `@adrkit/sdk` once it exists, and on `@adrkit/cli` JSON until then. Ask adrkit
for a per-record parse and a record-path predicate in the SDK, which would close G3 and G4. Report
F2 upstream.

## Reproduce

Run these from `spike/`. `@adrkit/sdk` is a `file:../../adrkit/packages/sdk` link, so it resolves
to an adrkit checkout beside this repository (`<parent>/adrkit` next to
`<parent>/adrkit-backstage`). `npm ci` succeeds without it and leaves a dangling symlink. Anything
that imports the SDK needs that checkout installed with `bun install` and a built
`packages/core/dist`, at a commit whose dist matches the SDK source: `8da6a09` is what the spike
ran against. On import, with the local checkout moved on to a later `main` but its
`packages/core/dist` not rebuilt, `npm run typecheck` failed with
`Module '"@adrkit/core"' has no exported member 'todayUtcDate'`: the stale-dist problem of F5
again. The default `?via=cli` route does not need the link. `scripts/render-decorator.ts` does,
because it prints the SDK column for comparison.

```bash
npm ci
npm run typecheck                          # all files; needs the adrkit checkout (see above)
npx tsc --noEmit -p tsconfig.ci.json       # the SDK-free subset CI runs; no checkout needed
npm start                                  # backend on :7007; Ctrl-C to stop
npm run decorator -- ../../adrkit/docs/adr # writes evidence/decorator-output.md
SPIKE_BASELINE=1 npm start                 # community defaults, for comparison
```

`tsconfig.ci.json` covers five of the eight source files. It leaves out
`src/backend/adrkitTier1Plugin.ts`, `src/backend/index.ts`, and `scripts/render-decorator.ts`,
because each reaches `@adrkit/sdk`. It goes away when the spike can depend on a published SDK.
