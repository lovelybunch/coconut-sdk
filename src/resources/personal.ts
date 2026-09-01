// The caller's private context, addressed under `personal/…`. Reads,
// metadata, links, and versions flow through the shared page routes (pass
// `personal/<path>` to `pages.*`); this namespace adds the personal-only
// surface — listing, writes (no template seeding on personal pages), and
// deletion — with paths relative to the personal space.

import { CocoHttp, encodePagePath } from "../http.js";
import type { Page, PageWriteResult, SpacePagesResult } from "../types.js";

export interface WritePersonalPageOptions {
  title?: string;
  frontmatter?: Record<string, unknown>;
  content: string;
  /**
   * Required when updating an existing page (sent as `If-Match`); omit when
   * creating. A stale value throws `CocoVersionConflictError`.
   */
  expectedVersion?: number;
}

export class PersonalApi {
  constructor(private readonly http: CocoHttp) {}

  /** Lists the caller's personal pages (`GET /pages/personal`). */
  list(): Promise<SpacePagesResult> {
    return this.http.requestJson<SpacePagesResult>("GET", "/pages/personal");
  }

  /** Reads one personal page as JSON. `path` is relative (e.g. `notes/today`). */
  get(path: string, options: { version?: number } = {}): Promise<Page> {
    return this.http.requestJson<Page>("GET", `/pages/personal/${encodePagePath(path)}`, {
      query: { version: options.version },
      accept: "application/json",
    });
  }

  /** Reads one personal page as markdown. */
  getMarkdown(path: string, options: { version?: number } = {}): Promise<string> {
    return this.http.requestText("GET", `/pages/personal/${encodePagePath(path)}`, {
      query: { version: options.version },
      accept: "text/markdown",
    });
  }

  /** Creates (201) or updates (needs `expectedVersion`) a personal page. */
  write(path: string, options: WritePersonalPageOptions): Promise<PageWriteResult> {
    const { expectedVersion, ...body } = options;
    return this.http.requestJson<PageWriteResult>("PUT", `/pages/personal/${encodePagePath(path)}`, {
      body,
      ifMatchVersion: expectedVersion,
    });
  }

  /** Permanently deletes a personal page (personal pages only). */
  delete(path: string): Promise<{ path: string; deleted: boolean }> {
    return this.http.requestJson<{ path: string; deleted: boolean }>(
      "DELETE",
      `/pages/personal/${encodePagePath(path)}`,
    );
  }
}
