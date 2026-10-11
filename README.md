# adrkit-backstage

Backstage plugins that show an [adrkit](https://github.com/mbeacom/adrkit) decision corpus
inside Backstage. They extend
[`@backstage-community/plugin-adr`](https://github.com/backstage/community-plugins/tree/main/workspaces/adr)
instead of replacing it.

**Status: experimental. The spike is done, the packages are not built yet, and nothing is
published.** The repository holds only the spike that decided the plugins' shape
([`spike/`](spike/)). No package, tag, release, or npm name exists. This work is ADR-0014
**rung 1** evidence only, and adrkit
[ADR-0029](https://github.com/mbeacom/adrkit/blob/main/docs/adr/0029-scope-backstage-publication-as-a-downstream-consumer-tiered-on-the-entity-owners.md)
clause 10 authorizes no release.

## Why this is a separate repository

adrkit
[ADR-0030](https://github.com/mbeacom/adrkit/blob/main/docs/adr/0030-keep-extension-surfaces-that-carry-a-dependency-tree-outside-this-repository.md)
keeps any extension surface that carries a dependency tree out of the adrkit repository. The
Backstage surface fails that rule by 1,274 packages, as ADR-0030 measured. The spike's own
install has 1,294 lockfile entries and a 947 MB `node_modules`. This repository is that surface's home. ADR-0030 action
item 6 asks for this location to be recorded in that record. That edit belongs in the adrkit
repository and has not been made yet.

## Spike verdict

The spike ran on 2026-10-10 against adrkit's own `docs/adr` at `8da6a09`, read through
Backstage's `UrlReaderService`. The full write-up is [`spike/SPIKE.md`](spike/SPIKE.md), and
the results are also posted on
[mbeacom/adrkit#298](https://github.com/mbeacom/adrkit/issues/298).

| Goal | Result |
|---|---|
| 1. `adrExtensionPoint.setAdrInfoParser` (ADR list) | **Pass.** `/api/adr/list` returned 60 rows with the correct id, title, status, and date |
| 2. `adrsCollatorExtensionPoint.setAdrParser` + `setAdrFilePathFilter` (search) | **Pass.** 59 ADRs indexed, template excluded. `filters[...]` matches on status, supersedes, supersededBy, and tags. `field:value` query syntax does not work |
| 3. Frontend `contentDecorators` header (status, supersession, approvals vs quorum) | **Pass, headless only.** It typechecks, including a New Frontend System override, and renders to HTML. `@bob` and `@Bob` count as "1 of 2". It has not been loaded in a browser |
| 4. End to end against an entity with `backstage.io/adr-location` | **Pass on the backend.** The list, file, search, and queue endpoints were captured |
| 5. Can Tier 1 work through the community plugin alone? | **No.** `AdrInfo` cannot carry approvals, quorum, or objections, and the hooks are synchronous per-file text transforms. Tier 1 needs its own small read-only backend plugin |

Two community plugin bugs turned up: dates show a day early west of UTC, and nested
frontmatter renders as `[object Object]`. Both are written up, ready to file, in
[`docs/upstream-issues.md`](docs/upstream-issues.md).

## Planned packages

From the spike's recommended layout. None of these exist yet.

```text
plugins/
  adrkit-backend/                 # Tier 1 backend plugin (pluginId 'adrkit'): queue, graph, and
                                  #   governing() only for a path a person typed or configured
  adr-backend-module-adrkit/      # pluginId 'adr': list parser via setAdrInfoParser
  search-backend-module-adrkit/   # pluginId 'search': setAdrParser + setAdrFilePathFilter
  adrkit/                         # frontend: header decorator, AdrkitEntityAdrContent wrapper,
                                  #   New Frontend System override, queue and graph pages
  adrkit-common/                  # shared types and frontmatter field selection
packages/backend, packages/app    # dev harness only, never published
```

`adrkit-common` holds code only until adrkit's SDK offers a single-record parse and the
record-filename rule (spike gaps G3 and G4).

## Constraints

These come from adrkit's accepted records and the spike. A change that breaks one of them
needs a record in adrkit first, not a workaround here.

- **Tier 1 only** (ADR-0029 clause 1): browsing the corpus, the review queue and its SLA state,
  the supersession graph, record status, the document layer, and governing decisions for a path
  that is **explicitly supplied**, meaning typed by a person or set in configuration a person
  wrote. A path derived from any catalog entity field is Tier 2.
- **No Tier 2** (clauses 2 and 7): no "which decisions govern this component" and no live
  catalog read for ownership. Tier 2 waits on adrkit's offline catalog envelope.
- **Read-only.** No write routes. The plugins never approve, object, resolve, or accept a
  record. They show no readiness verdict and print no review or ratify command. The pull
  request is the only write path.
- **No re-derived rules** (clause 8). Approval counting, queue construction, graph building,
  and `affects` matching come from adrkit, never reimplemented here.
- **Read the corpus through `UrlReaderService`**, so Backstage's integration allowlist applies.
  The corpus URL is the entity's `backstage.io/adr-location` annotation.
- **Use the published `@adrkit/cli` JSON until `@adrkit/sdk` publishes**
  ([ADR-0031](https://github.com/mbeacom/adrkit/blob/main/docs/adr/0031-publish-a-narrow-consumer-sdk-as-the-contract-and-document-the-cli-json-as-its-s.md),
  [ADR-0053](https://github.com/mbeacom/adrkit/blob/main/docs/adr/0053-implement-adrkit-sdk-over-core-s-kernels-and-accept-an-in-repo-consumer-as-its-r.md)).
  The spike showed why (finding F5): linking the SDK from source ran a stale prebuilt core and
  reported 2 approvals where `@adrkit/cli@0.19.0` reported 1.
- **Pin the community plugins to the tested versions**: `plugin-adr` 0.31.0,
  `plugin-adr-backend` 0.26.1, `plugin-adr-common` 0.25.0, and `search-backend-module-adr`
  0.23.1. That is one tested point, not a range. Widening it means verifying again
  (clause 9, following ADR-0019).
- **Extend `@backstage-community/plugin-adr`; do not compete with it** (clause 9).
  Reimplementing ADR rendering first needs an adrkit ADR naming the extension point that was
  tried and what failed.

## Run the spike locally

You need Node 22 and npm 10. The default Tier 1 route (`?via=cli`) uses only the published
`@adrkit/cli`.

```bash
cd spike
npm ci
npx tsc --noEmit -p tsconfig.ci.json   # what CI runs
npm start                              # backend on :7007; Ctrl-C to stop
```

The spike backend turns off Backstage's default auth policy so curl can reach its routes. Run
it only on your own machine, and never copy that setting into anything else (see the warning
in [`spike/SPIKE.md`](spike/SPIKE.md)).

`npm run typecheck`, `npm run decorator`, and the `?via=sdk` route also need an adrkit checkout
beside this repository (`../adrkit`, relative to the repository root), installed with
`bun install` and with a built `packages/core/dist`. `spike/SPIKE.md` covers that setup under
*Reproduce*.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `npm ci --ignore-scripts` and
`tsc --noEmit -p tsconfig.ci.json` in `spike/`. That covers five of the spike's eight source
files. The other three import the unpublished `@adrkit/sdk` through a `file:` link, and CI
does not check out adrkit to build it. They get CI coverage once the SDK is published.

## Links

- [adrkit ADR-0029](https://github.com/mbeacom/adrkit/blob/main/docs/adr/0029-scope-backstage-publication-as-a-downstream-consumer-tiered-on-the-entity-owners.md): scope of Backstage publication, Tier 1 and Tier 2
- [adrkit ADR-0030](https://github.com/mbeacom/adrkit/blob/main/docs/adr/0030-keep-extension-surfaces-that-carry-a-dependency-tree-outside-this-repository.md): why this lives in its own repository
- [adrkit ADR-0031](https://github.com/mbeacom/adrkit/blob/main/docs/adr/0031-publish-a-narrow-consumer-sdk-as-the-contract-and-document-the-cli-json-as-its-s.md) and [ADR-0053](https://github.com/mbeacom/adrkit/blob/main/docs/adr/0053-implement-adrkit-sdk-over-core-s-kernels-and-accept-an-in-repo-consumer-as-its-r.md): `@adrkit/sdk` as the consumer contract, still unpublished
- [mbeacom/adrkit#298](https://github.com/mbeacom/adrkit/issues/298): the spike issue and its results

## License

Apache-2.0. See [`LICENSE`](LICENSE). Contributions need a DCO sign-off; see
[`CONTRIBUTING.md`](CONTRIBUTING.md).
