// Example 04 — Chat with a space.
//
// A terminal REPL that grounds Claude in a Coco space: Claude gets tools that
// wrap the coconut-sdk read surface (list pages, read pages, full-text search,
// typed record queries) and answers questions with citations to page paths.
//
//   export ANTHROPIC_API_KEY=sk-ant-...      (or `ant auth login`)
//   pnpm example:chat
//
// Try: "What's in this space?", "Which deals are in diligence, best first?",
//      "Read the Acme memo and summarize the risks."
//
// Env: COCO_BASE_URL, COCO_API_KEY, COCO_SPACE (see shared.ts), CHAT_MODEL.

import readline from "node:readline/promises";
import Anthropic from "@anthropic-ai/sdk";
import { CocoApiError } from "../src/index.js";
import { createClientFromEnv, SPACE } from "./shared.js";

const coco = createClientFromEnv();
const anthropic = new Anthropic();
const MODEL = process.env.CHAT_MODEL ?? "claude-opus-5";

// --- Tools over the SDK's read surface --------------------------------------

const tools: Anthropic.Tool[] = [
  {
    name: "list_pages",
    description:
      "List the pages of the space (path, title, version, updatedAt). Paths are cited back to the user.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "read_page",
    description:
      "Read one page as markdown (frontmatter block included). Use the exact path from list_pages, search_pages, or query_records.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Full page path, e.g. 'demo/deals/acme'." },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "search_pages",
    description: "Full-text search over the space — 'which pages talk about X'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "list_record_types",
    description:
      "The space's record types (templates with a metadata schema) and their fields — check this before query_records.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "query_records",
    description:
      "Query typed records by metadata — 'which pages ARE in state X'. Filters are AND-ed. Ops: eq, neq, exists, missing, gt, gte, lt, lte, contains, in, not-in (value is any / none of an array of candidates).",
    input_schema: {
      type: "object",
      properties: {
        template: { type: "string", description: "Record type name from list_record_types." },
        filters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              op: {
                type: "string",
                enum: [
                  "eq",
                  "neq",
                  "exists",
                  "missing",
                  "gt",
                  "gte",
                  "lt",
                  "lte",
                  "contains",
                  "in",
                  "not-in",
                ],
              },
              value: {},
            },
            required: ["key", "op"],
            additionalProperties: false,
          },
        },
        orderBy: { type: "string", description: "Metadata key to order by." },
        order: { type: "string", enum: ["asc", "desc"] },
      },
      required: ["template"],
      additionalProperties: false,
    },
  },
];

async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "list_pages": {
      const result = await coco.spaces.pages(SPACE);
      return JSON.stringify(result.items, null, 2);
    }
    case "read_page":
      return coco.pages.getMarkdown(String(input.path));
    case "search_pages": {
      const result = await coco.search.text(String(input.query), {
        space: SPACE,
        limit: typeof input.limit === "number" ? input.limit : 10,
      });
      return JSON.stringify(result.items, null, 2);
    }
    case "list_record_types": {
      const types = await coco.records.types(SPACE);
      return JSON.stringify(
        types.map(({ name: typeName, title, description, schema }) => ({
          name: typeName,
          title,
          description,
          fields: schema?.fields,
        })),
        null,
        2,
      );
    }
    case "query_records": {
      const result = await coco.records.query(SPACE, String(input.template), {
        filters: Array.isArray(input.filters) ? (input.filters as never) : undefined,
        orderBy: typeof input.orderBy === "string" ? input.orderBy : undefined,
        order: input.order === "desc" ? "desc" : input.order === "asc" ? "asc" : undefined,
      });
      return JSON.stringify(result.items, null, 2);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- Conversation loop -------------------------------------------------------

const spaceInfo = await coco.spaces.pages(SPACE);
const system: Anthropic.TextBlockParam[] = [
  {
    type: "text",
    text: [
      `You are the knowledge assistant for the "${spaceInfo.spaceName}" space (slug: ${SPACE})`,
      "in Coco, a versioned markdown knowledge base where pages carry structured,",
      "queryable metadata.",
      "",
      "Ground every answer in the space's pages using your tools. Prefer",
      "query_records for questions about state (stages, scores, dates) and",
      "search_pages/read_page for questions about content. Cite the page paths",
      "you used, formatted as inline code. If the space doesn't contain the",
      "answer, say so instead of guessing.",
      "",
      `Pages currently in the space:`,
      ...spaceInfo.items.map((page) => `- ${page.path} — ${page.title}`),
    ].join("\n"),
    // The system prompt is stable across the whole session — cache it.
    cache_control: { type: "ephemeral" },
  },
];

const messages: Anthropic.MessageParam[] = [];

async function turn(userInput: string): Promise<void> {
  messages.push({ role: "user", content: userInput });
  for (;;) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system,
      tools,
      messages,
    });
    // Append the full content (thinking blocks included) so multi-step tool
    // use and caching keep working across turns.
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") {
      console.log("\n[the model declined this request]");
      return;
    }

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) console.log(`\n${block.text}`);
    }
    if (toolUses.length === 0 || response.stop_reason !== "tool_use") return;

    // Execute every requested tool and answer them all in ONE user message.
    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (toolUse) => {
        console.log(`  ⚙ ${toolUse.name}(${JSON.stringify(toolUse.input)})`);
        try {
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: await runTool(toolUse.name, toolUse.input as Record<string, unknown>),
          };
        } catch (error) {
          const message =
            error instanceof CocoApiError
              ? `Coco API error ${error.status}: ${error.message}`
              : String(error);
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: message,
            is_error: true,
          };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
}

console.log(`Chatting with "${spaceInfo.spaceName}" (${spaceInfo.items.length} pages) via ${MODEL}.`);
console.log(`Ask about the space, or "exit" to quit.\n`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
for (;;) {
  const line = (await rl.question("you> ")).trim();
  if (!line || line === "exit" || line === "quit") break;
  try {
    await turn(line);
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(`\n[Claude API error ${error.status}] ${error.message}`);
    } else if (error instanceof CocoApiError) {
      console.error(`\n[Coco API error ${error.status}] ${error.message}`);
    } else {
      throw error;
    }
  }
  console.log();
}
rl.close();
