// Shared pages: reads (markdown / JSON / historical versions), optimistic-
// concurrency writes, revision history, links, and per-page metadata. Every
// method also works for personal pages by addressing them as `personal/<path>`
// — the API routes personal paths through the same handlers.

import { CocoHttp, encodePagePath } from "../http.js";
import {
  CocoNotFoundError,
  CocoPreconditionRequiredError,
  CocoVersionConflictError,
} from "../errors.js";
import type {
  CreatePageOptions,
  MakeLatestResult,
  MetadataHistoryResult,
  MetadataPatch,
  Page,
  PageLinksResult,
  PageListResult,
  PageMetadataResult,
  PageVersionsResult,
  PageWriteResult,
  RecentPagesResult,
  UpdatePageOptions,
} from "../types.js";

export interface UpsertPageOptions {
  title?: string;
  frontmatter?: Record<string, unknown>;
  content: string;
  note?: string;
  /** Create-only fields, applied when the page doesn't exist yet. */
  template?: string;
  metadata?: Record<string, unknown>;
  /** Retries on concurrent-writer conflicts (default 3 attempts). */
  maxAttempts?: number;
}

export class PagesApi {
  constructor(private readonly http: CocoHttp) {}

  /** Every page the caller can list, org-wide (`GET /pages`). */
  list(): Promise<PageListResult> {
    return this.http.requestJson<PageListResult>("GET", "/pages");
  }

  /**
   * Recently updated pages, newest first (`GET /pages/recent`). Reserved
   * prefixes (`agents/`, `templates/`) are excluded. `space: "personal"`
   * scopes to your private context.
   */
  recent(options: { space?: string; limit?: number } = {}): Promise<RecentPagesResult> {
    return this.http.requestJson<RecentPagesResult>("GET", "/pages/recent", {
      query: { space: options.space, limit: options.limit },
    });
  }

  /** The page as a structured JSON envelope (frontmatter + markdown body). */
  get(path: string, options: { version?: number } = {}): Promise<Page> {
    return this.http.requestJson<Page>("GET", `/pages/${encodePagePath(path)}`, {
      query: { version: options.version },
      accept: "application/json",
    });
  }

  /** The page as clean markdown (leading `---` frontmatter block included). */
  getMarkdown(path: string, options: { version?: number } = {}): Promise<string> {
    return this.http.requestText("GET", `/pages/${encodePagePath(path)}`, {
      query: { version: options.version },
      accept: "text/markdown",
    });
  }

  /**
   * Creates a page (`PUT`, expects 201). Supports `template` + `metadata`
   * seeding. Throws `CocoPreconditionRequiredError` if the page already
   * exists — use `update` or `upsert` for existing pages.
   */
  create(path: string, options: CreatePageOptions): Promise<PageWriteResult> {
    return this.http.requestJson<PageWriteResult>("PUT", `/pages/${encodePagePath(path)}`, {
      body: options,
    });
  }

  /**
   * Updates an existing page. `expectedVersion` is sent as `If-Match`; a
   * stale value throws `CocoVersionConflictError` — re-read and retry.
   */
  update(path: string, options: UpdatePageOptions): Promise<PageWriteResult> {
    const { expectedVersion, ...body } = options;
    return this.http.requestJson<PageWriteResult>("PUT", `/pages/${encodePagePath(path)}`, {
      body,
      ifMatchVersion: expectedVersion,
    });
  }

  /**
   * Create-or-update convenience: reads the current version, writes against
   * it, and retries on concurrent-writer races (412/428) up to `maxAttempts`.
   */
  async upsert(path: string, options: UpsertPageOptions): Promise<PageWriteResult> {
    const { maxAttempts = 3, template, metadata, ...body } = options;
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let currentVersion: number | null = null;
      try {
        currentVersion = (await this.get(path)).version;
      } catch (error) {
        if (!(error instanceof CocoNotFoundError)) throw error;
      }
      try {
        if (currentVersion === null) {
          return await this.create(path, { ...body, template, metadata });
        }
        return await this.update(path, { ...body, expectedVersion: currentVersion });
      } catch (error) {
        // Lost a race with a concurrent writer: 412 (stale version) when
        // updating, 428 (page appeared between read and create) when creating.
        if (error instanceof CocoVersionConflictError || error instanceof CocoPreconditionRequiredError) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  /** Revision history, newest first. */
  versions(path: string): Promise<PageVersionsResult> {
    return this.http.requestJson<PageVersionsResult>("GET", `/pages/${encodePagePath(path)}/versions`);
  }

  /** Restores a historical version by appending a new revision copied from it. */
  makeLatest(path: string, version: number): Promise<MakeLatestResult> {
    return this.http.requestJson<MakeLatestResult>(
      "POST",
      `/pages/${encodePagePath(path)}/versions/${version}/make-latest`,
    );
  }

  /** Outbound links (broken targets flagged) and ACL-filtered backlinks. */
  links(path: string): Promise<PageLinksResult> {
    return this.http.requestJson<PageLinksResult>("GET", `/pages/${encodePagePath(path)}/links`);
  }

  /** Current metadata with per-key attribution. */
  getMetadata(path: string): Promise<PageMetadataResult> {
    return this.http.requestJson<PageMetadataResult>("GET", `/pages/${encodePagePath(path)}/metadata`);
  }

  /**
   * Merge-patches metadata without creating a page revision: `set` upserts
   * (null deletes), `append` extends arrays, `appendUnique` is idempotent.
   */
  patchMetadata(path: string, patch: MetadataPatch): Promise<PageMetadataResult> {
    return this.http.requestJson<PageMetadataResult>("PATCH", `/pages/${encodePagePath(path)}/metadata`, {
      body: patch,
    });
  }

  /** Per-key metadata audit trail, newest first. */
  metadataHistory(path: string, options: { limit?: number } = {}): Promise<MetadataHistoryResult> {
    return this.http.requestJson<MetadataHistoryResult>(
      "GET",
      `/pages/${encodePagePath(path)}/metadata/history`,
      { query: { limit: options.limit } },
    );
  }
}
