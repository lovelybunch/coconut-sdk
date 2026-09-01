import { describe, expect, it } from "vitest";
import { CocoClient } from "./client.js";
import {
  CocoNotFoundError,
  CocoPermissionError,
  CocoPreconditionRequiredError,
  CocoRateLimitError,
  CocoVersionConflictError,
} from "./errors.js";
import { encodePagePath } from "./http.js";

type RecordedRequest = {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: unknown;
};

type CannedResponse = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
};

/** A fetch double that records requests and replays canned responses in order. */
function createMockFetch(responses: CannedResponse[]) {
  const requests: RecordedRequest[] = [];
  const fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const canned = responses.shift() ?? { status: 200, body: {} };
    requests.push({
      method: init?.method ?? "GET",
      url: new URL(input),
      headers: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>).map(([key, value]) => [
          key.toLowerCase(),
          value,
        ]),
      ),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const isText = typeof canned.body === "string";
    return new Response(isText ? (canned.body as string) : JSON.stringify(canned.body ?? {}), {
      status: canned.status ?? 200,
      headers: {
        "content-type": isText ? "text/markdown; charset=utf-8" : "application/json",
        ...canned.headers,
      },
    });
  };
  return { fetch, requests };
}

function createClient(responses: CannedResponse[], options: Record<string, unknown> = {}) {
  const mock = createMockFetch(responses);
  const client = new CocoClient({
    baseUrl: "http://coco.test",
    apiKey: "coco_test_key",
    fetch: mock.fetch,
    maxRetries: 0,
    ...options,
  });
  return { client, requests: mock.requests };
}

describe("auth and headers", () => {
  it("sends the bearer key, org context, and JSON accept by default", async () => {
    const { client, requests } = createClient([{ body: { items: [] } }], { orgSlug: "acme" });
    await client.spaces.list();
    expect(requests[0].headers.authorization).toBe("Bearer coco_test_key");
    expect(requests[0].headers["x-coco-org-slug"]).toBe("acme");
    expect(requests[0].headers.accept).toBe("application/json");
  });

  it("supports the dev identity header instead of a key", async () => {
    const { client, requests } = createClient([{ body: { items: [] } }], {
      apiKey: undefined,
      devUser: "demo@local",
    });
    await client.pages.list();
    expect(requests[0].headers.authorization).toBeUndefined();
    expect(requests[0].headers["x-coco-user"]).toBe("demo@local");
  });
});

describe("pages", () => {
  it("reads a page as JSON with a version selector", async () => {
    const page = { path: "deals/acme", title: "Acme", version: 3, updatedAt: "", frontmatter: {}, content: "# A" };
    const { client, requests } = createClient([{ body: page }]);
    const result = await client.pages.get("deals/acme", { version: 3 });
    expect(result).toEqual(page);
    expect(requests[0].url.pathname).toBe("/pages/deals/acme");
    expect(requests[0].url.searchParams.get("version")).toBe("3");
  });

  it("reads markdown with the markdown accept header", async () => {
    const { client, requests } = createClient([{ body: "---\ntitle: Acme\n---\n\n# A" }]);
    const markdown = await client.pages.getMarkdown("deals/acme");
    expect(markdown).toContain("# A");
    expect(requests[0].headers.accept).toBe("text/markdown");
  });

  it("percent-encodes path segments but keeps separators", () => {
    expect(encodePagePath("deals/2026/a b")).toBe("deals/2026/a%20b");
  });

  it("creates with template + metadata and no If-Match", async () => {
    const { client, requests } = createClient([{ status: 201, body: { path: "deals/acme", version: 1 } }]);
    await client.pages.create("deals/acme", {
      title: "Acme",
      template: "deal-memo",
      metadata: { stage: "sourcing" },
    });
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].headers["if-match"]).toBeUndefined();
    expect(requests[0].body).toMatchObject({ template: "deal-memo", metadata: { stage: "sourcing" } });
  });

  it("updates with the expected version as a weak ETag", async () => {
    const { client, requests } = createClient([{ body: { path: "deals/acme", version: 4 } }]);
    await client.pages.update("deals/acme", { content: "# v4", expectedVersion: 3 });
    expect(requests[0].headers["if-match"]).toBe('W/"3"');
    expect(requests[0].body).toEqual({ content: "# v4" });
  });

  it("maps 412 to CocoVersionConflictError", async () => {
    const { client } = createClient([{ status: 412, body: { error: "Version conflict" } }]);
    await expect(
      client.pages.update("deals/acme", { content: "x", expectedVersion: 1 }),
    ).rejects.toBeInstanceOf(CocoVersionConflictError);
  });

  it("maps 428 to CocoPreconditionRequiredError", async () => {
    const { client } = createClient([{ status: 428, body: { error: "If-Match required" } }]);
    await expect(client.pages.create("deals/acme", { content: "x" })).rejects.toBeInstanceOf(
      CocoPreconditionRequiredError,
    );
  });

  it("surfaces 403 deny payloads with reasonCode and nextSteps", async () => {
    const { client } = createClient([
      {
        status: 403,
        body: { error: "Forbidden", reasonCode: "space_membership_required", nextSteps: ["Ask an admin."] },
      },
    ]);
    const error = await client.pages.get("private/page").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CocoPermissionError);
    expect((error as CocoPermissionError).reasonCode).toBe("space_membership_required");
    expect((error as CocoPermissionError).nextSteps).toEqual(["Ask an admin."]);
  });

  it("upsert creates when the page is missing", async () => {
    const { client, requests } = createClient([
      { status: 404, body: { error: "Not found" } },
      { status: 201, body: { path: "deals/acme", version: 1 } },
    ]);
    const result = await client.pages.upsert("deals/acme", { content: "# New" });
    expect(result.version).toBe(1);
    expect(requests.map((request) => request.method)).toEqual(["GET", "PUT"]);
  });

  it("upsert retries a version conflict with the fresh version", async () => {
    const page = { path: "deals/acme", title: "Acme", updatedAt: "", frontmatter: {}, content: "" };
    const { client, requests } = createClient([
      { body: { ...page, version: 3 } },
      { status: 412, body: { error: "Version conflict" } },
      { body: { ...page, version: 4 } },
      { body: { path: "deals/acme", version: 5 } },
    ]);
    const result = await client.pages.upsert("deals/acme", { content: "# Next" });
    expect(result.version).toBe(5);
    expect(requests[1].headers["if-match"]).toBe('W/"3"');
    expect(requests[3].headers["if-match"]).toBe('W/"4"');
  });

  it("patches metadata with set/append/appendUnique", async () => {
    const { client, requests } = createClient([{ body: { path: "deals/acme", metadata: {}, entries: [] } }]);
    await client.pages.patchMetadata("deals/acme", {
      set: { stage: "diligence" },
      appendUnique: { sources: ["https://a.example"] },
    });
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].url.pathname).toBe("/pages/deals/acme/metadata");
    expect(requests[0].body).toEqual({
      set: { stage: "diligence" },
      appendUnique: { sources: ["https://a.example"] },
    });
  });
});

describe("search", () => {
  it("serializes metadata filters as a JSON query parameter", async () => {
    const { client, requests } = createClient([{ body: { filters: [], space: null, items: [] } }]);
    await client.search.metadata({
      filters: [
        { key: "stage", op: "eq", value: "diligence" },
        { key: "conviction-score", op: "gte", value: 0.7 },
      ],
      space: "deals",
      orderBy: "conviction-score",
      order: "desc",
      includeMetadata: true,
    });
    const url = requests[0].url;
    expect(url.pathname).toBe("/search/metadata");
    expect(JSON.parse(url.searchParams.get("filters") ?? "[]")).toHaveLength(2);
    expect(url.searchParams.get("orderBy")).toBe("conviction-score");
    expect(url.searchParams.get("order")).toBe("desc");
    expect(url.searchParams.get("includeMetadata")).toBe("true");
  });

  it("runs full-text search with space scoping", async () => {
    const { client, requests } = createClient([{ body: { query: "acme", space: "deals", items: [] } }]);
    await client.search.text("acme", { space: "deals", limit: 5 });
    expect(requests[0].url.searchParams.get("q")).toBe("acme");
    expect(requests[0].url.searchParams.get("space")).toBe("deals");
    expect(requests[0].url.searchParams.get("limit")).toBe("5");
  });
});

describe("records", () => {
  it("queries with the implicit template stamp filter and metadata included", async () => {
    const { client, requests } = createClient([{ body: { filters: [], space: "deals", items: [] } }]);
    await client.records.query("deals", "deal-memo", {
      filters: [{ key: "stage", op: "eq", value: "diligence" }],
    });
    const filters = JSON.parse(requests[0].url.searchParams.get("filters") ?? "[]");
    expect(filters[0]).toEqual({ key: "template", op: "eq", value: "deal-memo" });
    expect(filters[1]).toEqual({ key: "stage", op: "eq", value: "diligence" });
    expect(requests[0].url.searchParams.get("includeMetadata")).toBe("true");
  });

  it("creates a record through the template door", async () => {
    const { client, requests } = createClient([{ status: 201, body: { path: "deals/deals/acme", version: 1 } }]);
    await client.records.create("deals", "deal-memo", {
      path: "deals/acme",
      metadata: { stage: "sourcing" },
    });
    expect(requests[0].url.pathname).toBe("/pages/deals/deals/acme");
    expect(requests[0].body).toMatchObject({ template: "deal-memo", metadata: { stage: "sourcing" } });
  });

  it("lists a space's record types (schema-bearing templates only)", async () => {
    const { client } = createClient([
      {
        body: {
          space: "deals",
          items: [
            { name: "deal-memo", schema: { fields: [], additionalKeys: "allow" } },
            { name: "plain-note" },
          ],
        },
      },
    ]);
    const types = await client.records.types("deals");
    expect(types.map((type) => type.name)).toEqual(["deal-memo"]);
  });
});

describe("agents", () => {
  it("triggers a run and polls it to a terminal status", async () => {
    const run = (status: string) => ({ runId: "r1", status, rawStatus: status, summary: "" });
    const { client, requests } = createClient([
      { status: 202, body: { runId: "r1", status: "queued", runPath: "p", taskPath: "t" } },
      { body: run("waiting") },
      { body: run("completed") },
    ]);
    const result = await client.agents.runTaskAndWait("deals", "daily-digest", { pollIntervalMs: 1 });
    expect(result.status).toBe("completed");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url.pathname).toBe("/spaces/deals/agent/tasks/daily-digest/runs");
    expect(requests[2].url.pathname).toBe("/spaces/deals/agent/runs/r1");
  });

  it("writes tasks with page-style optimistic concurrency", async () => {
    const { client, requests } = createClient([{ body: { path: "deals/agents/digest", version: 2 } }]);
    await client.agents.updateTask("deals", "digest", { content: "# Task", expectedVersion: 1 });
    expect(requests[0].headers["if-match"]).toBe('W/"1"');
  });
});

describe("session", () => {
  it("resolves the credential's principal and identity", async () => {
    const session = {
      principal: { id: "user-1", kind: "human", scopes: ["read", "write"] },
      identity: { name: "Ada", email: "ada@example.com" },
    };
    const { client, requests } = createClient([{ body: session }]);
    const result = await client.session();
    expect(result).toEqual(session);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url.pathname).toBe("/auth/session");
  });

  it("returns a null identity for agent-key principals", async () => {
    const { client } = createClient([
      { body: { principal: { id: "agent-1", kind: "agent", scopes: ["read", "write"] }, identity: null } },
    ]);
    const result = await client.session();
    expect(result.principal.kind).toBe("agent");
    expect(result.identity).toBeNull();
  });
});

describe("errors and retries", () => {
  it("maps 404 to CocoNotFoundError", async () => {
    const { client } = createClient([{ status: 404, body: { error: "Not found" } }]);
    await expect(client.pages.get("deals/missing")).rejects.toBeInstanceOf(CocoNotFoundError);
  });

  it("retries transient failures on GETs", async () => {
    const { client, requests } = createClient(
      [{ status: 503, body: { error: "unavailable" } }, { body: { items: [] } }],
      { maxRetries: 1, retryDelayMs: 1 },
    );
    const result = await client.pages.list();
    expect(result.items).toEqual([]);
    expect(requests).toHaveLength(2);
  });

  it("does not retry writes, and surfaces 429 as CocoRateLimitError", async () => {
    const { client, requests } = createClient(
      [{ status: 429, body: { error: "Rate limited", retryAfterSeconds: 7 } }],
      { maxRetries: 3, retryDelayMs: 1 },
    );
    const error = await client.agents.runTask("deals", "digest").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CocoRateLimitError);
    expect((error as CocoRateLimitError).retryAfterSeconds).toBe(7);
    expect(requests).toHaveLength(1);
  });
});
