# coconut-sdk examples

Six small scripts that walk the SDK's showcase path: discover → write back →
visualize → chat, then two that lean on pages being versioned and linked:
blame → gardener. They run against any Coconut Context deployment.

## Setup

```bash
pnpm install
```

Point the examples at a deployment via the env vars below; the defaults target
a local dev stack on `:8787` (inside the monorepo, `./scripts/compose-local.sh up`
brings one up, migrated and seeded).

| Variable | Default | Purpose |
|---|---|---|
| `COCO_BASE_URL` | `http://localhost:8787` | API origin |
| `COCO_API_KEY` | `dev-agent-key-change-me` | Agent key (`coco_...`) or OAuth access token |
| `COCO_ORG_SLUG` | _(unset)_ | Org context; only needed with the control-plane key on multi-tenant deployments |
| `COCO_SPACE` | `demo` | Space the examples read and write |
| `COCO_TEMPLATE` | `deal-memo` | Record type examples 01–03 use |
| `COCO_PAGE` | `<COCO_SPACE>/deals/acme` | Example 05 only — the page to blame |
| `ANTHROPIC_API_KEY` | _(unset)_ | Example 04 only |

Run them from this directory's package (`pnpm example:<name>`; inside the
monorepo, `pnpm --filter coconut-sdk example:<name>`).

## The scripts

### 02 — Write back (`pnpm example:write-back`)

Start here: it seeds what the others read. Authors a record type (a template
with a metadata schema), creates records from it that are born conforming,
shows a schema violation being rejected, patches metadata with idempotent
appends, and prints the per-key audit trail. Re-runs are safe — it updates
what it already wrote and adds a revision each time.

### 01 — Pull (`pnpm example:pull`)

Discovers the record types in the space, pulls the records of one type with a
metadata query (filters, ordering), prints them as a table, and reads one page
both as JSON and as markdown — with its link graph.

### 03 — Visualize (`pnpm example:visualize`)

Reads the records again and renders a self-contained HTML dashboard (stage
distribution, conviction scores, a per-record table) into `out/`, then writes a
summary page back into the space so the dashboard's findings are pages too.

### 04 — Chat with a space (`pnpm example:chat`)

A Claude-powered REPL grounded in the space: the model gets tools that wrap the
SDK's read surface (list pages, read pages, full-text search, metadata query)
and answers questions with citations to the pages it read. Needs
`ANTHROPIC_API_KEY`.

### 05 — Blame (`pnpm example:blame`)

`git blame` for a memo. Replays every revision of one page oldest → newest and
attributes each line of the current body to the revision that introduced it,
with author, kind (human vs agent) and revision note in the gutter. Then merges
the revision history with the per-key metadata audit trail into one timeline,
and finishes by rolling the page back to its first revision with make-latest
and forward again — both land as new revisions, so nothing is ever lost.
Re-run example 02 a couple of times first to give the memo some history.

### 06 — Gardener (`pnpm example:gardener`)

Tends the space's link graph. Plants a notes page with two dangling links,
walks every page's outbound links, and reports orphans (nothing links here),
hubs (most connected) and dangling links (the space-wide broken-link report).
It heals the dangling links by planting stub pages — through the matching
record type when the target lives under a type's default path, so the stub is
born conforming and stamped — then writes a **Map of content** page back into
the space: a Mermaid graph of the links (orphans dashed, new stubs bold) plus
the orphan/hub report, stamped with metadata so the garden's health is
queryable over time. Re-runs find nothing to heal and refresh the map.

## What they show

- Templates are record types: the schema makes records conform on creation.
- Metadata is the queryable layer; page bodies are the narrative. Query for
  state, read the page for the story.
- Every write is a revision and every metadata change is a signed event, so
  agents and people can audit each other. The space agent (when enabled)
  keeps pages fresh.
- Links are a derived index: the API keeps the graph current on every write,
  so tools can map, audit and heal it.
