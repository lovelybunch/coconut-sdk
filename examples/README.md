# coconut-sdk examples

Four small scripts that walk the SDK's showcase path: discover → write back →
visualize → chat. They run against any Coconut Context deployment.

## Setup

```bash
pnpm install
```

Point the examples at any deployment via the env vars below; the defaults
target a local dev stack of the product on `:8787`.

Configuration (all optional, shown with defaults):

| Env var | Default | What it is |
|---|---|---|
| `COCO_BASE_URL` | `http://localhost:8787` | API origin |
| `COCO_API_KEY` | `dev-agent-key-change-me` | Bearer credential (local dev seed; real deployments mint `coco_...` keys at **Admin → Agent keys**) |
| `COCO_SPACE` | `demo` | Space the examples read/write |
| `COCO_TEMPLATE` | `deal-memo` | Record type the examples use |
| `COCO_ORG_SLUG` | — | Org context on multi-tenant deployments |
| `ANTHROPIC_API_KEY` | — | Example 04 only (or sign in with `ant auth login`) |
| `CHAT_MODEL` | `claude-opus-5` | Example 04 only |

## The scripts

Run example 02 first — it seeds the data the others read.

### 02 — Write back (`pnpm example:write-back`)

Authors a **record type** (a `deal-memo` page template with a metadata schema),
creates deal records from it — born conforming and stamped — then shows the
write primitives: schema-validated metadata patches (`set` / idempotent
`appendUnique`), optimistic-concurrency body updates (If-Match / 412), revision
notes, and the per-key metadata audit trail.

### 01 — Pull (`pnpm example:pull`)

The discovery surfaces an agent uses on first contact: spaces with stats, the
metadata key namespace, each space's record types, a typed record query ordered
by conviction score, and one page in both representations (JSON envelope and
clean markdown) plus its link graph.

### 03 — Visualize (`pnpm example:visualize`)

Pulls the deal records, renders a self-contained HTML dashboard (stat tiles +
an SVG bar chart of deals per stage + a table view, light/dark aware, no chart
library) to `examples/out/pipeline-dashboard.html`, then writes a markdown
pipeline summary **back into the space** — stamped with metadata so the report
itself is queryable, with internal links that land in the link graph.

### 04 — Chat with a space (`pnpm example:chat`)

A terminal REPL that grounds Claude in the space: the model gets tools wrapping
the SDK's read surface (list pages, read page, full-text search, record
queries) and answers with page-path citations. Uses the official
`@anthropic-ai/sdk` with prompt caching on the space overview.

Prompts to try:

- "What's in this space?"
- "Which deals are in diligence with conviction ≥ 0.7, best first?"
- "Read the Acme memo and summarize the risks in two bullets."
- "Compare the sourcing-stage deals. Which one should we prioritize and why?"
- "What changed most recently? Anything stale?"
- "Draft a one-paragraph partner-meeting update from the pipeline summary."

## Where to go from here

- **Space agents**: `coco.agents.createTask(...)` + `runTaskAndWait(...)` turn
  the chat loop inside-out — the deployment's own agent runs on a schedule and
  keeps pages fresh (see the product docs).
- **Webhooks**: point a subscription at your endpoint and every write these
  examples make becomes a signed event (see the product docs).
- **Export/import**: `coco.spaces.export("demo")` snapshots everything the
  examples built into a portable bundle.
