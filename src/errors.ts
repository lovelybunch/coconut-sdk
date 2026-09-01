// Typed errors for every non-2xx the Coco API returns. Each subclass maps to
// one HTTP status family the API actually uses, so callers can catch the
// failure they care about (`CocoVersionConflictError` for optimistic-
// concurrency retries, `CocoRateLimitError` for backoff) without inspecting
// status codes.

/** Base class for everything this SDK throws. */
export class CocoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CocoError";
  }
}

/** A request that never produced an HTTP response (DNS, refused, aborted). */
export class CocoConnectionError extends CocoError {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CocoConnectionError";
  }
}

/** Fields the API commonly includes in error bodies. */
export interface CocoApiErrorBody {
  error?: string;
  /** Stable machine-readable deny/failure reason (e.g. `insufficient_role`). */
  reasonCode?: string;
  /** Human-actionable remediation steps for 403s. */
  nextSteps?: string[];
  retryAfterSeconds?: number;
  [key: string]: unknown;
}

export interface CocoApiErrorOptions {
  status: number;
  method: string;
  url: string;
  body?: unknown;
}

/** Any non-2xx HTTP response from the API. */
export class CocoApiError extends CocoError {
  readonly status: number;
  readonly method: string;
  readonly url: string;
  /** Parsed response body (JSON object when the API sent one, else raw text). */
  readonly body?: unknown;
  readonly reasonCode?: string;
  readonly nextSteps?: string[];
  readonly retryAfterSeconds?: number;

  constructor(message: string, options: CocoApiErrorOptions) {
    super(message);
    this.name = "CocoApiError";
    this.status = options.status;
    this.method = options.method;
    this.url = options.url;
    this.body = options.body;
    if (options.body && typeof options.body === "object" && !Array.isArray(options.body)) {
      const body = options.body as CocoApiErrorBody;
      if (typeof body.reasonCode === "string") this.reasonCode = body.reasonCode;
      if (Array.isArray(body.nextSteps)) {
        this.nextSteps = body.nextSteps.filter((step): step is string => typeof step === "string");
      }
      if (typeof body.retryAfterSeconds === "number") this.retryAfterSeconds = body.retryAfterSeconds;
    }
  }
}

/** 400 — invalid request (bad path, bad filters, template schema violations). */
export class CocoValidationError extends CocoApiError {
  constructor(message: string, options: CocoApiErrorOptions) {
    super(message, options);
    this.name = "CocoValidationError";
  }
}

/** 401 — missing or unrecognized credential. */
export class CocoAuthenticationError extends CocoApiError {
  constructor(message: string, options: CocoApiErrorOptions) {
    super(message, options);
    this.name = "CocoAuthenticationError";
  }
}

/** 402 — plan cap reached or agent credits exhausted. */
export class CocoPaymentRequiredError extends CocoApiError {
  constructor(message: string, options: CocoApiErrorOptions) {
    super(message, options);
    this.name = "CocoPaymentRequiredError";
  }
}

/** 403 — authenticated but denied by the ACL engine; see `reasonCode`/`nextSteps`. */
export class CocoPermissionError extends CocoApiError {
  constructor(message: string, options: CocoApiErrorOptions) {
    super(message, options);
    this.name = "CocoPermissionError";
  }
}

/** 404 — page, space, template, or run not found (or not visible to you). */
export class CocoNotFoundError extends CocoApiError {
  constructor(message: string, options: CocoApiErrorOptions) {
    super(message, options);
    this.name = "CocoNotFoundError";
  }
}

/** 409 — state conflict (e.g. task instructions empty, agents not enabled). */
export class CocoConflictError extends CocoApiError {
  constructor(message: string, options: CocoApiErrorOptions) {
    super(message, options);
    this.name = "CocoConflictError";
  }
}

/**
 * 412 — the `If-Match` version no longer matches: someone else wrote a new
 * revision first. Re-read the page and retry with the fresh version.
 */
export class CocoVersionConflictError extends CocoApiError {
  constructor(message: string, options: CocoApiErrorOptions) {
    super(message, options);
    this.name = "CocoVersionConflictError";
  }
}

/** 428 — the write targets an existing page and requires `If-Match`. */
export class CocoPreconditionRequiredError extends CocoApiError {
  constructor(message: string, options: CocoApiErrorOptions) {
    super(message, options);
    this.name = "CocoPreconditionRequiredError";
  }
}

/** 429 — rate limited; honor `retryAfterSeconds`. */
export class CocoRateLimitError extends CocoApiError {
  constructor(message: string, options: CocoApiErrorOptions) {
    super(message, options);
    this.name = "CocoRateLimitError";
  }
}

/** 5xx — the deployment failed or the feature is unavailable in this runtime. */
export class CocoServerError extends CocoApiError {
  constructor(message: string, options: CocoApiErrorOptions) {
    super(message, options);
    this.name = "CocoServerError";
  }
}

/** Maps an HTTP status to the matching error subclass. */
export function createApiError(message: string, options: CocoApiErrorOptions): CocoApiError {
  switch (options.status) {
    case 400:
      return new CocoValidationError(message, options);
    case 401:
      return new CocoAuthenticationError(message, options);
    case 402:
      return new CocoPaymentRequiredError(message, options);
    case 403:
      return new CocoPermissionError(message, options);
    case 404:
      return new CocoNotFoundError(message, options);
    case 409:
      return new CocoConflictError(message, options);
    case 412:
      return new CocoVersionConflictError(message, options);
    case 428:
      return new CocoPreconditionRequiredError(message, options);
    case 429:
      return new CocoRateLimitError(message, options);
    default:
      if (options.status >= 500) return new CocoServerError(message, options);
      return new CocoApiError(message, options);
  }
}
