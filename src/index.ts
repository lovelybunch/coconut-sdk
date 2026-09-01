// coconut-sdk — TypeScript client for the Coconut Context HTTP API.
// The documented contract lives in openapi.yaml at the repository root.

export { CocoClient, type CocoClientOptions } from "./client.js";
export { encodePagePath, type CocoAuthOptions, type CocoHttpOptions, type FetchLike } from "./http.js";
export {
  CocoApiError,
  CocoAuthenticationError,
  CocoConflictError,
  CocoConnectionError,
  CocoError,
  CocoNotFoundError,
  CocoPaymentRequiredError,
  CocoPermissionError,
  CocoPreconditionRequiredError,
  CocoRateLimitError,
  CocoServerError,
  CocoValidationError,
  CocoVersionConflictError,
} from "./errors.js";
export type { UpsertPageOptions } from "./resources/pages.js";
export type { WritePersonalPageOptions } from "./resources/personal.js";
export type { CreateRecordOptions, RecordQueryOptions } from "./resources/templates.js";
export * from "./types.js";
