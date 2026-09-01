// Page templates (record types): pages under a space's reserved `templates/`
// prefix. A template with a `metadataSchema` is a record type for its space —
// a Deal, an Event, a Prospect — and `records` below is the typed-record
// convenience layer over templates + the metadata query engine.

import { CocoHttp } from "../http.js";
import type {
  MetadataFilter,
  MetadataQueryResult,
  PageWriteResult,
  TemplateSummary,
  TemplatesResult,
} from "../types.js";
import { PagesApi } from "./pages.js";
import { SearchApi } from "./search.js";

export class TemplatesApi {
  constructor(private readonly http: CocoHttp) {}

  /**
   * Templates visible to the caller — org-wide, or one space's — with their
   * normalized metadata `schema`, `metadataDefaults`, and `defaultPathPrefix`.
   */
  list(options: { space?: string; includeContent?: boolean } = {}): Promise<TemplatesResult> {
    return this.http.requestJson<TemplatesResult>("GET", "/templates", {
      query: {
        space: options.space,
        includeContent: options.includeContent ? "true" : undefined,
      },
    });
  }
}

export interface RecordQueryOptions {
  /** Additional filters AND-ed with the implicit `template = <name>` stamp. */
  filters?: MetadataFilter[];
  orderBy?: string;
  order?: "asc" | "desc";
  limit?: number;
  /** Include each record's full metadata (default true — records are data). */
  includeMetadata?: boolean;
}

export interface CreateRecordOptions {
  /** Page path relative to the space (e.g. `deals/acme`). */
  path: string;
  title?: string;
  /** Markdown body; omit to start from the template's content. */
  content?: string;
  /** Field values, validated against the template's schema before creation. */
  metadata?: Record<string, unknown>;
  note?: string;
}

/**
 * Typed records: pages stamped with a schema-bearing template. Thin sugar
 * over `templates`, `search.metadata`, and `pages.create` so "list every
 * open deal" or "create a conforming event" is one call.
 */
export class RecordsApi {
  constructor(
    private readonly templates: TemplatesApi,
    private readonly search: SearchApi,
    private readonly pages: PagesApi,
  ) {}

  /** The record types of a space: its templates that declare a schema. */
  async types(space: string): Promise<TemplateSummary[]> {
    const result = await this.templates.list({ space });
    return result.items.filter((template) => template.schema);
  }

  /**
   * Records of one type in one space: a metadata query with the implicit
   * `template = <name>` filter, metadata included by default.
   */
  query(space: string, template: string, options: RecordQueryOptions = {}): Promise<MetadataQueryResult> {
    return this.search.metadata({
      filters: [{ key: "template", op: "eq", value: template }, ...(options.filters ?? [])],
      space,
      limit: options.limit,
      includeMetadata: options.includeMetadata ?? true,
      orderBy: options.orderBy,
      order: options.order,
    });
  }

  /**
   * Creates a record: a page born from the template, stamped, and validated
   * against the schema (violations are a 400 with per-field issues — nothing
   * half-created).
   */
  create(space: string, template: string, options: CreateRecordOptions): Promise<PageWriteResult> {
    const { path, ...rest } = options;
    return this.pages.create(`${space}/${path}`, { ...rest, template });
  }
}
