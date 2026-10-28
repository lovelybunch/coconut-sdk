// Response and request shapes for the Coco HTTP API, transcribed from the
// API's route handlers (packages/api/src/index.ts) and the agent tool layer
// (packages/mcp/src/agents.ts). Timestamps are ISO-8601 strings.

/** Any JSON value — metadata values, frontmatter values. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// ---------------------------------------------------------------------------
// Auth / session
// ---------------------------------------------------------------------------

/** The resolved principal behind a credential (`GET /auth/session`). */
export interface SessionPrincipal {
  id: string;
  kind: "human" | "agent";
  /** Credential scopes (`read`, `write`); OAuth read-only tokens carry just `read`. */
  scopes: string[];
}

export interface SessionResult {
  principal: SessionPrincipal;
  /** Populated for human principals (OAuth tokens, sessions); null for agent keys. */
  identity: { name: string; email: string } | null;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/** One row of a page listing (`GET /pages`, `GET /spaces/:slug/pages`, …). */
export interface PageSummary {
  path: string;
  title: string;
  version: number;
  updatedAt: string;
  /** Change note on the current revision, when one was recorded (`GET /pages` only). */
  note?: string;
}

/** Full page in the JSON representation (`GET /pages/:space/:path`, Accept: application/json). */
export interface Page {
  path: string;
  title: string;
  version: number;
  updatedAt: string;
  frontmatter: Record<string, unknown>;
  content: string;
}

export interface PageListResult {
  items: PageSummary[];
}

export interface RecentPagesResult {
  space: string | null;
  limit: number;
  items: PageSummary[];
}

export interface SpacePagesResult {
  space: string;
  spaceId: string;
  spaceName: string;
  spaceDescription: string;
  /**
   * `"own"` when the caller sees only the pages they created in this space
   * (receipt logging, specs/SPACE-CONTRIBUTIONS.md); absent otherwise.
   */
  scope?: "own";
  /** Present with `scope: "own"`: where contributed pages go and what they are stamped with. */
  contribution?: { pathPrefix: string; template: string | null };
  items: PageSummary[];
}

export interface CreatePageOptions {
  title?: string;
  frontmatter?: Record<string, unknown>;
  /** Markdown body. Optional when a `template` supplies the starting content. */
  content?: string;
  /**
   * Page template to seed from: a template name in the page's own space
   * (`deal-memo`) or a cross-space path (`deals/templates/deal-memo`).
   */
  template?: string;
  /** Starting metadata, merged over the template's defaults and validated. */
  metadata?: Record<string, unknown>;
  /** Revision note shown in version history. */
  note?: string;
}

export interface UpdatePageOptions {
  title?: string;
  frontmatter?: Record<string, unknown>;
  content: string;
  note?: string;
  /**
   * The version this update is based on (sent as `If-Match`). A stale value
   * throws `CocoVersionConflictError`.
   */
  expectedVersion: number;
}

export interface PageWriteResult {
  path: string;
  version: number;
  /** Present on create when a template/metadata seed was applied. */
  metadata?: Record<string, unknown>;
}

export interface PageVersion {
  version: number;
  title: string;
  author: string;
  authorType: "human" | "agent";
  authorLabel: string;
  note: string | null;
  createdAt: string;
  isLatest: boolean;
}

export interface PageVersionsResult {
  path: string;
  currentVersion: number;
  items: PageVersion[];
}

export interface MakeLatestResult {
  path: string;
  /** The historical version that was promoted. */
  sourceVersion: number;
  /** The new latest version created by the promotion. */
  version: number;
}

// ---------------------------------------------------------------------------
// Page metadata
// ---------------------------------------------------------------------------

export interface MetadataEntry {
  key: string;
  value: unknown;
  updatedBy: string;
  updatedByType: "human" | "agent";
  updatedByLabel: string;
  updatedAt: string;
}

export interface PageMetadataResult {
  path: string;
  /** Key → value view of the entries. */
  metadata: Record<string, unknown>;
  entries: MetadataEntry[];
}

/**
 * Merge-patch for page metadata: send only the keys you're changing.
 * `set` upserts (JSON `null` deletes a key), `append` extends arrays
 * atomically, `appendUnique` skips values already present (idempotent
 * re-runs).
 */
export interface MetadataPatch {
  set?: Record<string, unknown>;
  append?: Record<string, unknown>;
  appendUnique?: Record<string, unknown>;
}

export interface MetadataEvent {
  key: string;
  op: string;
  value: unknown;
  previousValue: unknown;
  actor: string;
  actorType: "human" | "agent";
  actorLabel: string;
  createdAt: string;
}

export interface MetadataHistoryResult {
  path: string;
  items: MetadataEvent[];
}

// ---------------------------------------------------------------------------
// Search & metadata queries
// ---------------------------------------------------------------------------

export interface SearchItem {
  path: string;
  title: string;
  snippet: string;
  version: number;
  score: number;
  updatedAt: string;
}

export interface SearchResult {
  query: string;
  space: string | null;
  items: SearchItem[];
}

export type MetadataFilterOp =
  "eq" | "neq" | "exists" | "missing" | "gt" | "gte" | "lt" | "lte" | "contains" | "in" | "not-in";

export interface MetadataFilter {
  key: string;
  op: MetadataFilterOp;
  /**
   * Required for every op except `exists` / `missing`. For `in` / `not-in`,
   * a non-empty array of candidate values.
   */
  value?: unknown;
}

export interface MetadataQueryOptions {
  filters: MetadataFilter[];
  /** Space slug, or `personal` for your private context. Omit for org-wide. */
  space?: string;
  /** Rows per page (default 20, max 500). */
  limit?: number;
  /** Rows to skip; pass the previous result's `nextOffset` to page forward. */
  offset?: number;
  /** Include each page's full metadata record in the results. */
  includeMetadata?: boolean;
  /** Also return `total`, the exact number of matching pages. */
  includeTotal?: boolean;
  /** Metadata key to order by (numbers first, then strings, missing last). Exclusive with `sort`. */
  orderBy?: string;
  /**
   * Order by a page field instead of a metadata value: `updated` is the
   * page's last update (a metadata key named `updatedAt` is unaffected).
   * Exclusive with `orderBy`.
   */
  sort?: "updated";
  /** Direction for `orderBy` or `sort` (default asc). */
  order?: "asc" | "desc";
}

export interface MetadataQueryItem {
  path: string;
  title: string;
  version: number;
  updatedAt: string;
  /** Present when `includeMetadata` was requested. */
  metadata?: Record<string, unknown>;
}

export interface MetadataQueryResult {
  filters: MetadataFilter[];
  space: string | null;
  /** The window actually applied (limit is clamped server-side). */
  limit: number;
  offset: number;
  /** True when more matching pages exist past this window. */
  hasMore: boolean;
  /** Offset for the next page, or null when `hasMore` is false. */
  nextOffset: number | null;
  /** Exact count of every matching page; present when `includeTotal` was requested. */
  total?: number;
  items: MetadataQueryItem[];
}

export interface MetadataKeySummary {
  key: string;
  pageCount: number;
  valueTypes: string[];
  lastUpdatedAt: string;
}

export interface MetadataKeysResult {
  space: string | null;
  items: MetadataKeySummary[];
}

export interface MetadataValueSummary {
  space: string;
  value: unknown;
  pageCount: number;
  lastUpdatedAt: string;
}

export interface MetadataValuesResult {
  space: string | null;
  key: string;
  items: MetadataValueSummary[];
}

// ---------------------------------------------------------------------------
// Spaces, export/import
// ---------------------------------------------------------------------------

export interface SpaceSummary {
  slug: string;
  name: string;
  description: string;
  visibility: "private" | "org" | null;
  /** Present with `includeStats` — pages this caller can read. */
  pageCount?: number;
  lastUpdatedAt?: string | null;
}

export interface SpaceListResult {
  items: SpaceSummary[];
}

export interface ExportedPage {
  /** Space-relative path (no space slug prefix). */
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
  content: string;
  version: number;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface SpaceExportBundle {
  format: "coco-space-export";
  formatVersion: 1;
  exportedAt: string;
  space: { slug: string; name: string; description: string };
  pages: ExportedPage[];
}

export interface SpaceImportResult {
  space: string;
  mode: "skip" | "overwrite";
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ path: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Page links
// ---------------------------------------------------------------------------

export interface OutboundLink {
  targetPath: string;
  anchorText: string;
  targetExists: boolean;
  targetTitle: string | null;
}

export interface Backlink {
  sourcePath: string;
  sourceTitle: string;
  anchorText: string;
  sourceUpdatedAt: string;
}

export interface PageLinksResult {
  path: string;
  outbound: OutboundLink[];
  backlinks: Backlink[];
}

export interface BrokenLink {
  sourcePath: string;
  targetPath: string;
  anchorText: string;
}

export interface BrokenLinksResult {
  spaceSlug: string;
  items: BrokenLink[];
}

// ---------------------------------------------------------------------------
// Page templates (record types)
// ---------------------------------------------------------------------------

export type TemplateFieldType =
  "string" | "text" | "number" | "boolean" | "date" | "select" | "multiselect" | "list" | "url";

export interface TemplateField {
  key: string;
  type: TemplateFieldType;
  label: string;
  description?: string;
  required: boolean;
  default?: unknown;
  /** Allowed values for select/multiselect. */
  options?: string[];
  /** Inclusive numeric bounds (number fields). */
  min?: number;
  max?: number;
}

export interface TemplateMetadataSchema {
  fields: TemplateField[];
  /** Whether metadata keys the schema doesn't declare may be written. */
  additionalKeys: "allow" | "reject";
}

export interface TemplateSummary {
  /** Full page path of the template (`<space>/templates/<name>`). */
  path: string;
  space: string;
  spaceName: string;
  /** Template name — the path under `templates/`. */
  name: string;
  title: string;
  description: string;
  version: number;
  updatedAt: string;
  metadataDefaults?: Record<string, unknown>;
  /** Normalized metadata schema; present when the template declares one. */
  schema?: TemplateMetadataSchema;
  /** Where records of this type conventionally live (`deals/`, `events/`). */
  defaultPathPrefix?: string;
  /** Lenient-parse diagnostics for the template author. */
  schemaIssues?: string[];
  /** Present with `includeContent`. */
  content?: string;
}

export interface TemplatesResult {
  space: string | null;
  items: TemplateSummary[];
}

// ---------------------------------------------------------------------------
// Space templates (whole-space kits)
// ---------------------------------------------------------------------------

export type SpaceTemplateSource = "builtin" | "remote" | "org";

export interface SpaceTemplateSummary {
  source: SpaceTemplateSource;
  id: string;
  title: string;
  description: string;
  category: string;
  kind: string;
  solution: string | null;
  publisher: string | null;
  space: { slug: string; name: string; description: string };
  pageCount: number;
  updatedAt?: string;
  /** Present with `includePages` — card-weight page index, no content. */
  pages?: Array<Record<string, unknown>>;
}

export interface SpaceTemplateListResult {
  items: SpaceTemplateSummary[];
}

export interface SpaceTemplatePage {
  path: string;
  title: string;
  description: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
  agentTask?: boolean;
  schema?: TemplateMetadataSchema;
}

export interface SpaceTemplateDetail extends Omit<SpaceTemplateSummary, "pages"> {
  pages: SpaceTemplatePage[];
}

export interface CreateSpaceFromTemplateOptions {
  /** Slug for the new space (lowercase kebab-case). */
  slug: string;
  name?: string;
  description?: string;
  visibility?: "private" | "org";
}

export interface CreateSpaceFromTemplateResult {
  space: {
    id: string;
    slug: string;
    name: string;
    description: string;
    visibility: string;
  };
  template: { source: SpaceTemplateSource; id: string };
  pages: { created: number; errors: Array<{ path: string; error: string }> };
}

// ---------------------------------------------------------------------------
// Space agents
// ---------------------------------------------------------------------------

export type AgentRunStatus = "completed" | "failed" | "running" | "waiting" | "unknown";

export interface AgentSummary {
  spaceSlug: string;
  hasInstructions: boolean;
  instructionsPath: string;
  instructionsUpdatedAt: string | null;
  taskCount: number;
  runCount: number;
  lastRunAt: string | null;
  lastRunPath: string | null;
}

export interface AgentListResult {
  items: AgentSummary[];
}

export interface AgentModelOption {
  /** What a task's `model` frontmatter key stores. */
  id: string;
  /** Human-friendly catalog label; null for custom ids. */
  label: string | null;
  isDefault: boolean;
}

export interface AgentModelsResult {
  /** The organization default — used by every task without a pinned model. */
  defaultModel: string;
  models: AgentModelOption[];
}

export interface AgentTaskSchedule {
  cron: string;
  timezone: string;
  enabled: boolean;
  valid: boolean;
}

export interface AgentTask {
  path: string;
  spaceSlug: string;
  /** Task path under `agents/` (e.g. `daily-digest`). */
  task: string;
  title: string;
  version: number;
  updatedAt: string;
  schedule: AgentTaskSchedule | null;
  runCount: number;
  lastRunAt: string | null;
  lastRunStatus: AgentRunStatus | null;
}

export interface AgentTaskListResult {
  spaceSlug: string | null;
  items: AgentTask[];
}

export interface AgentRun {
  runId: string;
  path: string;
  taskPath: string | null;
  /** Presented status: stale running/waiting records (>10 min) read as failed. */
  status: AgentRunStatus;
  /** The stored status, unmodified. */
  rawStatus: string;
  trigger: string;
  ranAt: string | null;
  durationMs: number | null;
  modelProvider: string | null;
  modelId: string | null;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    steps: number | null;
  } | null;
  turns: number | null;
  sessionId: string | null;
  summary: string;
  updatedAt: string;
}

export interface AgentTaskDetail extends AgentTask {
  /** Full task page as markdown (frontmatter block + instructions body). */
  markdown: string;
  frontmatter: Record<string, unknown>;
  /** Most recent runs, newest first. */
  runs?: AgentRun[];
}

export interface AgentRunListResult {
  path: string;
  items: AgentRun[];
}

export interface AgentRunDetail extends AgentRun {
  sourceTitle: string | null;
  /** The run's visible markdown output (transcript block stripped). */
  markdown: string;
  /** Chronological activity entries; present when `includeTranscript`. */
  transcript?: Array<Record<string, unknown>>;
}

export interface AgentRunTriggerResult {
  runId: string;
  status: "queued";
  runPath: string;
  taskPath: string;
}

export interface AgentInstructions {
  path: string;
  exists: boolean;
  markdown: string | null;
  version: number | null;
  updatedAt: string | null;
}

export interface WriteAgentTaskOptions {
  title?: string;
  /** Task instructions (markdown). Required. */
  content: string;
  /** Task frontmatter (e.g. `schedule`, `scheduleTz`, `scheduleEnabled`). */
  frontmatter?: Record<string, unknown>;
}

// Notifications — the caller's inbox (see DOCS.md "Notifications"). Rows are
// per-recipient: explicit space members at editor or above hear about their
// spaces, org admins about membership. Agent credentials have no inbox.

export type NotificationCategory = "page" | "agent_run" | "membership";

export interface NotificationActor {
  id: string;
  kind: "human" | "agent";
  /** Resolved display name (or a stable fallback such as `Agent 3fa2b1c0`). */
  label: string;
}

export interface NotificationEvent {
  id: string;
  category: NotificationCategory;
  /** e.g. `page.updated`, `agent.run.failed`, `membership.requested`. */
  type: string;
  spaceSlug: string | null;
  /** Page path for page and agent-run events; null for org-scoped events. */
  subjectPath: string | null;
  subjectTitle: string;
  actor: NotificationActor;
  /**
   * Per type: `version`/`changedKeys` for page events; `taskPath`, `taskTitle`,
   * `runId`, `status`, `trigger`, `durationMs`, `message` for agent runs;
   * `subjectUserId`, `email`, `displayName`, `role`, `status` for membership.
   * A page event on a typed record also carries `recordType`, `recordStatus`,
   * `recordOwner` (as written) and `attention`.
   */
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface Notification {
  id: string;
  /** Occurrences folded into this row while it stayed unread. */
  count: number;
  /** Latest occurrence — the inbox sort key. */
  occurredAt: string;
  readAt: string | null;
  /** One-line human summary, identical across REST, MCP, CLI and the app. */
  summary: string;
  /** App-relative link the row opens (`/pages/…`, `/admin/users`), or null. */
  href: string | null;
  /**
   * The row needs the caller rather than merely informing them: a failed
   * run, an access request, or a typed record (a task, a handoff) moved into
   * a state that waits on a person. Kept true through folds until read.
   */
  attention: boolean;
  event: NotificationEvent;
}

export interface NotificationUnreadSummary {
  /** Unread rows visible to the caller (access re-checked). */
  unread: number;
  /** Of `unread`, the rows that need the caller. */
  attention: number;
  /** Shared spaces with at least one unread row, by slug. Org-scoped rows count in the totals only. */
  bySpace: Record<string, { unread: number; attention: number }>;
}

export interface NotificationMarkAllReadOptions {
  /** Only this space's rows. */
  space?: string;
  /** `activity` leaves the rows that need the caller unread. Default `all`. */
  scope?: "all" | "activity";
}

export interface NotificationListOptions {
  unreadOnly?: boolean;
  /** Only this space's rows (a kebab-case slug). */
  space?: string;
  /** 1–100, default 20. */
  limit?: number;
  /** Opaque cursor from a previous page's `nextBefore` (a bare ISO timestamp also works). */
  before?: string;
}

export interface NotificationListResult {
  items: Notification[];
  /** Unread rows visible to the caller (access re-checked), independent of paging. */
  unread: number;
  /** Opaque keyset cursor; pass back as `before` for the next page. Null once exhausted. */
  nextBefore: string | null;
  limit: number;
  unreadOnly: boolean;
}
