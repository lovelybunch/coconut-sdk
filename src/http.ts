// Minimal fetch-based transport shared by every resource namespace. Owns
// authentication headers, URL building, JSON (de)serialization, optimistic-
// concurrency headers (If-Match / ETag), typed error mapping, and a small
// retry policy for transient failures on idempotent requests.

import { CocoConnectionError, createApiError } from "./errors.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CocoAuthOptions {
  /**
   * Agent API key or OAuth access token, sent as `Authorization: Bearer …`.
   * This is how agents and integrations authenticate.
   */
  apiKey?: string;
  /**
   * Development-mode identity header (`X-Coco-User`), honored only by
   * deployments running with dev header auth enabled. Never use in production.
   */
  devUser?: string;
  /**
   * Org context for multi-tenant deployments, sent as `X-Coco-Org-Slug`.
   * Single-tenant deployments need no org context.
   */
  orgSlug?: string;
  /** Org context by id (`X-Coco-Org-Id`); alternative to `orgSlug`. */
  orgId?: string;
}

export interface CocoHttpOptions extends CocoAuthOptions {
  /** API origin, e.g. `http://localhost:8787` or `https://api.example.com`. */
  baseUrl: string;
  /** Extra headers sent on every request (e.g. tracing). */
  headers?: Record<string, string>;
  /** Custom fetch implementation (tests, polyfills). Defaults to global fetch. */
  fetch?: FetchLike;
  /**
   * Max retries for transient failures (network errors, 429/502/503/504) on
   * idempotent (GET) requests. Default 2; set 0 to disable.
   */
  maxRetries?: number;
  /** Base delay between retries in ms (exponential backoff). Default 250. */
  retryDelayMs?: number;
}

export type QueryValue = string | number | boolean | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  /** JSON-serialized request body. */
  body?: unknown;
  /** `Accept` header (default `application/json`). */
  accept?: string;
  /**
   * Page version for optimistic concurrency; serialized as
   * `If-Match: W/"<version>"`, matching the API's ETag format.
   */
  ifMatchVersion?: number;
  headers?: Record<string, string>;
}

const RETRIABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_RETRY_DELAY_MS = 10_000;

/**
 * Percent-encodes a page path segment-by-segment, preserving the `/`
 * separators (`deals/2026/acme` → `deals/2026/acme`, `a b` → `a%20b`).
 */
export function encodePagePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CocoHttp {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: FetchLike;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: CocoHttpOptions) {
    if (!options.baseUrl) {
      throw new CocoConnectionError("baseUrl is required (e.g. http://localhost:8787).");
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.headers = { ...options.headers };
    if (options.apiKey) this.headers.authorization = `Bearer ${options.apiKey}`;
    if (options.devUser) this.headers["x-coco-user"] = options.devUser;
    if (options.orgSlug) this.headers["x-coco-org-slug"] = options.orgSlug;
    if (options.orgId) this.headers["x-coco-org-id"] = options.orgId;
    const fetchImpl = options.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!fetchImpl) {
      throw new CocoConnectionError("No fetch implementation available; pass one via options.fetch.");
    }
    // Bind in case a raw globalThis.fetch needs its receiver.
    this.fetchImpl = (input, init) => fetchImpl(input, init);
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 250;
  }

  buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  /** Performs a request and returns the parsed JSON body. */
  async requestJson<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.request(method, path, options);
    return (await response.json()) as T;
  }

  /** Performs a request and returns the body as text (markdown reads). */
  async requestText(method: string, path: string, options: RequestOptions = {}): Promise<string> {
    const response = await this.request(method, path, options);
    return response.text();
  }

  /** Performs a request, mapping non-2xx responses to typed errors. */
  async request(method: string, path: string, options: RequestOptions = {}): Promise<Response> {
    const url = this.buildUrl(path, options.query);
    const headers: Record<string, string> = {
      accept: options.accept ?? "application/json",
      ...this.headers,
      ...options.headers,
    };
    if (options.ifMatchVersion !== undefined) {
      headers["if-match"] = `W/"${options.ifMatchVersion}"`;
    }
    let body: string | undefined;
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const retriable = method === "GET" || method === "HEAD";
    const attempts = retriable ? this.maxRetries + 1 : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, { method, headers, body });
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attempts) {
          await sleep(Math.min(this.retryDelayMs * 2 ** attempt, MAX_RETRY_DELAY_MS));
          continue;
        }
        throw new CocoConnectionError(
          `${method} ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
          error,
        );
      }

      if (response.ok) return response;

      if (RETRIABLE_STATUSES.has(response.status) && attempt + 1 < attempts) {
        const retryAfterHeader = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfterHeader)
          ? Math.min(retryAfterHeader * 1000, MAX_RETRY_DELAY_MS)
          : Math.min(this.retryDelayMs * 2 ** attempt, MAX_RETRY_DELAY_MS);
        await sleep(delay);
        continue;
      }

      throw await this.toApiError(method, url, response);
    }
    // Unreachable: every loop path returns or throws. Keeps TS satisfied.
    throw new CocoConnectionError(`${method} ${url} failed`, lastError);
  }

  private async toApiError(method: string, url: string, response: Response) {
    let parsedBody: unknown;
    const contentType = response.headers.get("content-type") ?? "";
    try {
      parsedBody = contentType.includes("application/json")
        ? await response.json()
        : await response.text();
    } catch {
      parsedBody = undefined;
    }
    const serverMessage =
      parsedBody && typeof parsedBody === "object" && typeof (parsedBody as { error?: unknown }).error === "string"
        ? (parsedBody as { error: string }).error
        : undefined;
    const message = `${method} ${url} → ${response.status}${serverMessage ? `: ${serverMessage}` : ""}`;
    return createApiError(message, { status: response.status, method, url, body: parsedBody });
  }
}
