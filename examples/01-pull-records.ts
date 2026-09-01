// Example 01 — Discover and pull structured data.
//
// Walks the discovery surfaces an agent would use on first contact with a
// deployment: spaces, the metadata key namespace, each space's record types
// (schema-bearing templates), and finally a typed record query.
//
//   pnpm example:pull
//
// Env: COCO_BASE_URL, COCO_API_KEY, COCO_SPACE, COCO_TEMPLATE (see shared.ts).
// Run example 02 first if the target space has no records yet.

import { createClientFromEnv, heading, printTable, SPACE, TEMPLATE } from "./shared.js";

const coco = createClientFromEnv();

await coco.health();

heading("Spaces you can see");
const spaces = await coco.spaces.list({ includeStats: true });
printTable(
  spaces.items.map((space) => ({
    slug: space.slug,
    name: space.name,
    visibility: space.visibility ?? "",
    pages: space.pageCount ?? "",
    lastUpdated: space.lastUpdatedAt ?? "",
  })),
);

heading("Metadata key namespace (org-wide)");
const keys = await coco.search.metadataKeys({ limit: 10 });
printTable(
  keys.items.map((key) => ({
    key: key.key,
    pages: key.pageCount,
    types: key.valueTypes.join(", "),
  })),
);

heading(`Record types in "${SPACE}"`);
const types = await coco.records.types(SPACE);
printTable(
  types.map((template) => ({
    name: template.name,
    title: template.title,
    fields: template.schema?.fields.map((field) => field.key).join(", ") ?? "",
    recordsLiveAt: template.defaultPathPrefix ?? "(anywhere)",
  })),
);

heading(`"${TEMPLATE}" records in "${SPACE}"`);
const records = await coco.records.query(SPACE, TEMPLATE, {
  orderBy: "conviction-score",
  order: "desc",
});
printTable(
  records.items.map((record) => ({
    path: record.path,
    title: record.title,
    stage: String(record.metadata?.stage ?? ""),
    score: String(record.metadata?.["conviction-score"] ?? ""),
  })),
);

heading("One page, both representations");
const first = records.items[0];
if (first) {
  const page = await coco.pages.get(first.path);
  console.log(`JSON envelope: ${page.path} v${page.version} — "${page.title}"`);
  const markdown = await coco.pages.getMarkdown(first.path);
  console.log(`Markdown (first 3 lines):\n${markdown.split("\n").slice(0, 3).join("\n")}`);

  const links = await coco.pages.links(first.path);
  console.log(
    `Links: ${links.outbound.length} outbound, ${links.backlinks.length} backlinks`,
  );
} else {
  console.log(`No records found — run example 02 to seed "${SPACE}" first.`);
}
