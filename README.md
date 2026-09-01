# coconut-sdk

TypeScript SDK for the **Coconut Context** HTTP API — pages, structured
metadata, search, templates and typed records, spaces, export/import, page
links, and space agents.

- **Zero runtime dependencies** — built on the platform `fetch` (Node ≥ 20,
  Bun, Deno, modern browsers/workers).
- **Self-contained** — no dependency on the Coconut Context server code; the
  package builds and tests standalone.
- **Faithful to the API contract** — types are transcribed from
  [`openapi.yaml`](./openapi.yaml), the documented REST surface (vendored
  at the repo root and drift-checked nightly against the deployed contract).
  Admin consoles, auth flows, SCIM, billing, and internal runtime seams are
  intentionally out of scope.

## Install

```bash
npm install coconut-sdk
```

## Quickstart

```ts
import { CocoClient } from "coconut-sdk";

const coco = new CocoClient({
  baseUrl: "http://localhost:8787",
  apiKey: process.env.COCO_API_KEY, // agent key (coco_...) or OAuth access token
  // orgSlug: "acme",               // only on multi-tenant deployments
});

// Read a page both ways
const page = await coco.pages.get("deals/acme");          // JSON envelope
const markdown = await coco.pages.getMarkdown("deals/acme"); // clean markdown

// Create from a template (a record type), born conforming
await coco.pages.create("deals/globex", {
  title: "Globex",
  template: "deal-memo",
  metadata: { stage: "sourcing", "conviction-score": 0.4 },
});

// Patch metadata without creating a revision (idempotent appends)
await coco.pages.patchMetadata("deals/acme", {
  set: { stage: "diligence" },
  appendUnique: { sources: ["https://news.example/acme"] },
});

// Query across pages: "which pages ARE in state X"
const hot = await coco.search.metadata({
  filters: [
    { key: "stage", op: "eq", value: "diligence" },
    { key: "conviction-score", op: "gte", value: 0.7 },
  ],
  space: "deals",
  orderBy: "conviction-score",
  order: "desc",
  includeMetadata: true,
});

// Update with optimistic concurrency (If-Match under the hood)
await coco.pages.update("deals/acme", {
  content: "# Acme\n\nUpdated memo…",
  expectedVersion: page.version, // stale → CocoVersionConflictError (412)
});
// …or let upsert() do read → write → retry-on-conflict for you
await coco.pages.upsert("deals/acme", { content: "# Acme\n\nLatest." });
```

## Surface map

| Namespace | Covers |
|---|---|
| `coco.pages` | Page reads (JSON/markdown, historical versions), create/update/upsert, revision history + restore, link graph, metadata get/patch/history. Works for personal pages via `personal/...` paths too. |
| `coco.personal` | The caller's private context: list, read, write, delete. |
| `coco.spaces` | Space listings (+stats), per-space pages, export/import bundles, broken-link reports. |
| `coco.search` | Full-text search; metadata queries; key & value discovery. |
| `coco.templates` | Page templates with normalized metadata schemas. |
| `coco.records` | Typed-record sugar: `types(space)`, `query(space, type, …)` (implicit `template` stamp filter), `create(space, type, …)`. |
| `coco.spaceTemplates` | Whole-space starting kits: gallery, full bundles, create-space-from-template (org admin). |
| `coco.agents` | Space agents: rollups, model catalog, tasks (CRUD + schedules), async run triggers with `waitForRun`/`runTaskAndWait`, run records + transcripts, agent instructions. |

## Concurrency model

Page writes use the API's optimistic concurrency: updates send
`If-Match: W/"<version>"`. A missing version returns **428**
(`CocoPreconditionRequiredError`), a stale one **412**
(`CocoVersionConflictError`) — re-read and retry, or use `pages.upsert()`,
which does that loop for you. The same convention applies to agent tasks and
agent instructions.

## Errors

Every non-2xx becomes a typed error (all extend `CocoApiError`, which carries
`status`, `reasonCode`, `nextSteps`, and the parsed body):
`CocoValidationError` (400), `CocoAuthenticationError` (401),
`CocoPaymentRequiredError` (402), `CocoPermissionError` (403),
`CocoNotFoundError` (404), `CocoConflictError` (409),
`CocoVersionConflictError` (412), `CocoPreconditionRequiredError` (428),
`CocoRateLimitError` (429, with `retryAfterSeconds`), `CocoServerError` (5xx).
Transient failures (network, 429/502/503/504) are retried with backoff on GETs
only — writes are never retried automatically.

## Auth

| Option | Sends | Use |
|---|---|---|
| `apiKey` | `Authorization: Bearer …` | Agent keys (`coco_...`) and MCP OAuth access tokens (`at_...`, scope-capped) |
| `devUser` | `X-Coco-User` | Dev-header deployments only — never production |
| `orgSlug` / `orgId` | `X-Coco-Org-Slug` / `X-Coco-Org-Id` | Org context on multi-tenant deployments |

## Examples

See [`examples/`](./examples/README.md) for the showcase path — discover &
pull records, write back (templates, schema-validated metadata, audit trails),
render a dashboard from space data, and **chat with a space** (a Claude-powered
REPL grounded in pages via tool use).

## Development

```bash
pnpm build   # tsc → dist/
pnpm test    # vitest (mock-fetch unit tests)
pnpm lint    # typecheck incl. examples
```

## Releasing

Bump `version` in `package.json`, commit, tag `vX.Y.Z` (matching), push the
tag — [`release.yml`](.github/workflows/release.yml) builds, tests, and
publishes to npm via [trusted publishing](https://docs.npmjs.com/trusted-publishers)
(OIDC: tokenless, with automatic provenance attestations).

## License

[Apache-2.0](LICENSE) © Coconut AI Inc.
