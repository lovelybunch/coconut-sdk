// Search: full-text (Postgres FTS over title/path/content/frontmatter) and
// the metadata query engine — filters AND-ed together with optional ordering
// by a metadata value. Both are ACL-filtered per hit.

import { CocoHttp } from "../http.js";
import type {
  MetadataKeysResult,
  MetadataQueryOptions,
  MetadataQueryResult,
  MetadataValuesResult,
  SearchResult,
} from "../types.js";

export class SearchApi {
  constructor(private readonly http: CocoHttp) {}

  /** Full-text search. "Which pages talk about X." */
  text(query: string, options: { space?: string; limit?: number } = {}): Promise<SearchResult> {
    return this.http.requestJson<SearchResult>("GET", "/search", {
      query: { q: query, space: options.space, limit: options.limit },
    });
  }

  /**
   * Metadata query. "Which pages *are* in state X" — e.g.
   * `[{key: "stage", op: "eq", value: "diligence"},
   *   {key: "conviction-score", op: "gte", value: 0.7}]`.
   */
  metadata(options: MetadataQueryOptions): Promise<MetadataQueryResult> {
    return this.http.requestJson<MetadataQueryResult>("GET", "/search/metadata", {
      query: {
        filters: JSON.stringify(options.filters),
        space: options.space,
        limit: options.limit,
        includeMetadata: options.includeMetadata ? "true" : undefined,
        orderBy: options.orderBy,
        order: options.order,
      },
    });
  }

  /**
   * The metadata key namespace in use (with page counts and value types) —
   * check before writing new keys so the namespace stays converged.
   */
  metadataKeys(options: { space?: string; limit?: number } = {}): Promise<MetadataKeysResult> {
    return this.http.requestJson<MetadataKeysResult>("GET", "/search/metadata/keys", {
      query: { space: options.space, limit: options.limit },
    });
  }

  /**
   * Distinct values of one metadata key, grouped per space with page counts.
   * `metadataValues("template")` answers "which record types have pages, where".
   */
  metadataValues(
    key: string,
    options: { space?: string; limit?: number } = {},
  ): Promise<MetadataValuesResult> {
    return this.http.requestJson<MetadataValuesResult>("GET", "/search/metadata/values", {
      query: { key, space: options.space, limit: options.limit },
    });
  }
}
