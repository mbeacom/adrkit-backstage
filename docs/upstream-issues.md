# Upstream issues for `@backstage-community/plugin-adr`

The spike found two bugs in the community ADR plugin (`spike/SPIKE.md`, findings F2 and F3).
Neither has been filed. Each section below is written to be pasted into an issue on
[backstage/community-plugins](https://github.com/backstage/community-plugins/issues) for the
`workspaces/adr` workspace.

Both were observed at these versions, the only ones the spike tested:

| Package | Version |
|---|---|
| `@backstage-community/plugin-adr` | 0.31.0 |
| `@backstage-community/plugin-adr-common` | 0.25.0 |
| `@backstage-community/plugin-adr-backend` | 0.26.1 |
| Node | 22.22.2 |

Before filing, check the latest release and open issues. Either bug may already be fixed or
reported.

## Shared reproduction

Both bugs reproduce with one record and one script, with no Backstage app running. In any
directory with `@backstage-community/plugin-adr@0.31.0` and
`@backstage-community/plugin-adr-common@0.25.0` installed, save this as `repro.mjs`:

```js
import { madrParser, parseMadrWithFrontmatter } from '@backstage-community/plugin-adr-common';

const record = `---
status: accepted
date: 2026-08-15
review:
  quorum: 2
  approvals: ["@alice"]
provenance:
  authoredBy: human
---

# Use a frontmatter date

Body.
`;

console.log('TZ=%s', process.env.TZ);
console.log('parseMadrWithFrontmatter date:', parseMadrWithFrontmatter(record).date);
console.log('madrParser date:', madrParser(record).date);

// The decorator factories are not in the package's `exports`, so import the built file by path.
const { adrDecoratorFactories } = await import(
  new URL('./node_modules/@backstage-community/plugin-adr/dist/components/AdrReader/decorators.esm.js', import.meta.url)
);
const out = adrDecoratorFactories
  .createFrontMatterFormatterDecorator()({ baseUrl: '', content: record }).content;
console.log(out.split('\n').slice(0, 3).join('\n'));
```

Then run:

```bash
for tz in UTC America/New_York America/Los_Angeles Asia/Tokyo; do TZ=$tz node repro.mjs; echo; done
```

Observed output (abridged):

```text
TZ=UTC
parseMadrWithFrontmatter date: 2026-08-15
madrParser date: 2026-08-15
|Status|Date|Review|Provenance|
|---|---|---|---|
|accepted|Aug 15, 2026|[object Object]|[object Object]|

TZ=America/New_York
parseMadrWithFrontmatter date: 2026-08-14
madrParser date: 2026-08-14
|Status|Date|Review|Provenance|
|---|---|---|---|
|accepted|Aug 14, 2026|[object Object]|[object Object]|

TZ=America/Los_Angeles
(same as America/New_York)

TZ=Asia/Tokyo
(same as UTC)
```

---

## Issue 1: frontmatter dates show one day early west of UTC

**Title:** `plugin-adr`: frontmatter `date` shows one day early in time zones west of UTC

### Summary

A record with `date: 2026-08-15` in its YAML frontmatter is listed and rendered as `2026-08-14`
(or `Aug 14, 2026`) when the process formatting it runs west of UTC. Two code paths do this:

1. **Backend list and search** (`plugin-adr-common`, `parseMadrWithFrontmatter`, used by
   `madrParser`). The date depends on the **backend server's** time zone, so
   `/api/adr/list` and the search index carry the wrong date for every viewer.
2. **Frontend frontmatter table** (`plugin-adr`, `createFrontMatterFormatterDecorator`). The
   date depends on the **viewer's browser** time zone.

### Cause

`parseMadrWithFrontmatter` parses frontmatter with js-yaml's `timestampTag`, so a bare
`2026-08-15` becomes a `Date` at **UTC midnight**. It then does
(`plugin-adr-common/dist/search.esm.js`, 0.25.0):

```js
const luxdate = DateTime.fromJSDate(new Date(`${date}`));
const formattedDate = luxdate.toISODate();
```

`DateTime.fromJSDate` uses the local zone, so UTC midnight on the 15th is the evening of the
14th anywhere west of UTC, and `toISODate()` returns the 14th.

`createFrontMatterFormatterDecorator` (`plugin-adr/dist/components/AdrReader/decorators.esm.js`,
0.31.0) formats a `Date` value with:

```js
val.toLocaleString(undefined, { dateStyle: 'medium' })
```

That also formats in the viewer's local zone.

### Expected

A date-only frontmatter value is a calendar date. It should display as written,
`2026-08-15`, in every time zone.

### Suggested fix

- In `parseMadrWithFrontmatter`: `DateTime.fromJSDate(date, { zone: 'utc' }).toISODate()` when
  `date instanceof Date`, and keep string handling as it is otherwise.
- In `createFrontMatterFormatterDecorator`: pass `timeZone: 'UTC'` to `toLocaleString`.

A test that runs under `TZ=America/New_York` would catch a regression. In a UTC CI runner,
the bug never shows.

### Evidence from the spike

- `spike/evidence/baseline-community-list.json`: `/api/adr/list` from the community default
  parser, run in America/New_York. ADR-0029 (`date: 2026-08-15`) is listed as `2026-08-14`.
- `spike/evidence/adrkit-list.json`: the same corpus through the spike's own parser, which
  shows the correct date.
- `spike/evidence/decorator-output-with-community-frontmatter-formatter.md`: the frontend
  table, rendered headless in America/New_York. Fixture 0100 (`date: 2026-10-10`) shows
  `Oct 9, 2026`.

---

## Issue 2: nested frontmatter values render as `[object Object]`

**Title:** `plugin-adr`: frontmatter table renders nested mappings as `[object Object]`

### Summary

`createFrontMatterFormatterDecorator`, one of the default `contentDecorators`, turns every
top-level frontmatter key into a table column. When the value is a mapping, the cell reads
`[object Object]`. A list of mappings shows `[object Object],[object Object]`. Records that
keep structured metadata in frontmatter, such as review state or provenance, become
unreadable.

### Cause

`plugin-adr/dist/components/AdrReader/decorators.esm.js` (0.31.0):

```js
const stripNewLines = (val) => {
  if (val instanceof Date) {
    return val.toLocaleString(undefined, { dateStyle: 'medium' });
  }
  return String(val).replaceAll('\n', '<br/>');
};
```

`String(val)` on a plain object yields `[object Object]`.

### Expected

Nested values should be readable. Two options: render them as compact inline YAML or JSON, or
leave out keys whose values are not scalars and say so. Either is better than
`[object Object]`.

### Suggested fix

In `stripNewLines`, when `val` is a non-null object that is not a `Date`, serialize it, for
example with `JSON.stringify(val)` and escaped pipes, or with js-yaml's `dump` in flow style,
before the newline replacement. Escape `|` in every cell, because a value containing a pipe
also breaks the table today.

### Evidence from the spike

- `spike/evidence/decorator-output-with-community-frontmatter-formatter.md`: the default
  decorator chain over real adrkit records. The `review` and `provenance` columns show
  `[object Object]`.
- The shared reproduction above shows the same thing for a ten-line record.

### Workaround we use

Callers can pass their own `contentDecorators` without `createFrontMatterFormatterDecorator`.
Supplying `contentDecorators` replaces all three defaults, so the link and embed decorators
have to be re-added from `AdrReader.decorators`.
