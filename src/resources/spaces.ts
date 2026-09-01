// Spaces: listings, per-space page listings, broken-link reports, and the
// portable export/import bundle format (`coco-space-export`).

import { CocoHttp } from "../http.js";
import type {
  BrokenLinksResult,
  SpaceExportBundle,
  SpaceImportResult,
  SpaceListResult,
  SpacePagesResult,
} from "../types.js";

export class SpacesApi {
  constructor(private readonly http: CocoHttp) {}

  /** Spaces visible to the caller; `includeStats` adds readable-page rollups. */
  list(options: { includeStats?: boolean } = {}): Promise<SpaceListResult> {
    return this.http.requestJson<SpaceListResult>("GET", "/spaces", {
      query: { include: options.includeStats ? "stats" : undefined },
    });
  }

  /** ACL-visible pages of one space, sorted by path. */
  pages(spaceSlug: string): Promise<SpacePagesResult> {
    return this.http.requestJson<SpacePagesResult>("GET", `/spaces/${encodeURIComponent(spaceSlug)}/pages`);
  }

  /**
   * Exports the space as a self-contained JSON bundle — current version,
   * frontmatter, content, and metadata of every page you can read.
   */
  export(spaceSlug: string): Promise<SpaceExportBundle> {
    return this.http.requestJson<SpaceExportBundle>(
      "GET",
      `/spaces/${encodeURIComponent(spaceSlug)}/export`,
    );
  }

  /**
   * Imports a `coco-space-export` bundle. Paths are space-relative, so a
   * bundle exported from one space imports into another. `skip` (default)
   * leaves existing pages alone; `overwrite` writes new revisions.
   */
  import(
    spaceSlug: string,
    bundle: SpaceExportBundle,
    options: { mode?: "skip" | "overwrite" } = {},
  ): Promise<SpaceImportResult> {
    return this.http.requestJson<SpaceImportResult>(
      "POST",
      `/spaces/${encodeURIComponent(spaceSlug)}/import`,
      { query: { mode: options.mode }, body: bundle },
    );
  }

  /** Every stored link in the space whose target page doesn't exist. */
  brokenLinks(spaceSlug: string, options: { limit?: number } = {}): Promise<BrokenLinksResult> {
    return this.http.requestJson<BrokenLinksResult>(
      "GET",
      `/spaces/${encodeURIComponent(spaceSlug)}/links/broken`,
      { query: { limit: options.limit } },
    );
  }
}
