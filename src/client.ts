// The client facade: one configured HTTP transport shared by the resource
// namespaces. Covers the integration surface of the Coco API (pages, personal
// context, metadata, search, spaces, templates, records, space templates,
// space agents); admin consoles, auth flows, SCIM, and billing are
// intentionally out of scope.

import { CocoHttp, type CocoHttpOptions } from "./http.js";
import type { SessionResult } from "./types.js";
import { AgentsApi } from "./resources/agents.js";
import { PagesApi } from "./resources/pages.js";
import { PersonalApi } from "./resources/personal.js";
import { SearchApi } from "./resources/search.js";
import { SpaceTemplatesApi } from "./resources/space-templates.js";
import { SpacesApi } from "./resources/spaces.js";
import { RecordsApi, TemplatesApi } from "./resources/templates.js";

export type CocoClientOptions = CocoHttpOptions;

/**
 * Client for the Coco (Coconut Context) HTTP API.
 *
 * ```ts
 * const coco = new CocoClient({
 *   baseUrl: "http://localhost:8787",
 *   apiKey: process.env.COCO_API_KEY,
 * });
 * const deals = await coco.records.query("deals", "deal-memo", {
 *   filters: [{ key: "stage", op: "eq", value: "diligence" }],
 * });
 * ```
 */
export class CocoClient {
  /** Shared pages: reads, writes, versions, links, metadata. */
  readonly pages: PagesApi;
  /** The caller's private context (`personal/…`). */
  readonly personal: PersonalApi;
  /** Space listings, per-space pages, export/import, broken links. */
  readonly spaces: SpacesApi;
  /** Full-text search and metadata queries. */
  readonly search: SearchApi;
  /** Page templates (record types) visible to the caller. */
  readonly templates: TemplatesApi;
  /** Typed records: template-stamped pages as queryable data. */
  readonly records: RecordsApi;
  /** Whole-space starting kits (the /templates gallery). */
  readonly spaceTemplates: SpaceTemplatesApi;
  /** Space agents: tasks, runs, instructions. */
  readonly agents: AgentsApi;

  private readonly http: CocoHttp;

  constructor(options: CocoClientOptions) {
    this.http = new CocoHttp(options);
    this.pages = new PagesApi(this.http);
    this.personal = new PersonalApi(this.http);
    this.spaces = new SpacesApi(this.http);
    this.search = new SearchApi(this.http);
    this.templates = new TemplatesApi(this.http);
    this.records = new RecordsApi(this.templates, this.search, this.pages);
    this.spaceTemplates = new SpaceTemplatesApi(this.http);
    this.agents = new AgentsApi(this.http);
  }

  /** Liveness probe (`GET /health`). */
  health(): Promise<{ ok: boolean }> {
    return this.http.requestJson<{ ok: boolean }>("GET", "/health");
  }

  /**
   * Who the configured credential is (`GET /auth/session`): the resolved
   * principal (id, kind, scopes) and, for human principals, name + email.
   */
  session(): Promise<SessionResult> {
    return this.http.requestJson<SessionResult>("GET", "/auth/session");
  }
}
