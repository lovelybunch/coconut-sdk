// Example 02 — Author a record type, create records, write back safely.
//
// Seeds a small deal pipeline into a space you can write to:
//   1. Upserts a `deal-memo` template (a record type: metadata schema + memo body).
//   2. Creates deal records from it — born conforming, stamped, validated.
//   3. Patches metadata without touching the document (set / appendUnique).
//   4. Updates a page body with optimistic concurrency (If-Match under the hood).
//   5. Shows the per-key metadata audit trail.
//
//   pnpm example:write-back
//
// Safe to re-run: template upserts a new revision, record creates are skipped
// once they exist, and appendUnique patches are idempotent.

import { CocoPreconditionRequiredError, CocoValidationError } from "../src/index.js";
import { createClientFromEnv, heading, printTable, SPACE, TEMPLATE } from "./shared.js";

const coco = createClientFromEnv();

heading(`1. Upsert the "${TEMPLATE}" record type in "${SPACE}"`);
const template = await coco.pages.upsert(`${SPACE}/templates/${TEMPLATE}`, {
  title: "Deal memo",
  frontmatter: {
    description: "Investment memo starting point",
    defaultPathPrefix: "deals",
    metadataSchema: {
      fields: [
        {
          key: "stage",
          type: "select",
          options: ["sourcing", "diligence", "closed"],
          default: "sourcing",
          required: true,
        },
        { key: "conviction-score", type: "number", min: 0, max: 1, default: 0.5 },
        { key: "sources", type: "list" },
      ],
    },
  },
  content: [
    "# {Company}",
    "",
    "## Thesis",
    "_Why this could matter._",
    "",
    "## Risks",
    "_What kills it._",
    "",
    "## Diligence log",
    "_Newest first._",
  ].join("\n"),
  note: "Seeded by coconut-sdk example 02",
});
console.log(`Template at ${template.path} (v${template.version})`);

heading("2. Create records from the template");
const seedDeals: Array<{ slug: string; title: string; stage: string; score: number }> = [
  { slug: "acme", title: "Acme Corp", stage: "diligence", score: 0.82 },
  { slug: "globex", title: "Globex", stage: "diligence", score: 0.64 },
  { slug: "initech", title: "Initech", stage: "sourcing", score: 0.35 },
  { slug: "umbrella", title: "Umbrella", stage: "sourcing", score: 0.5 },
  { slug: "hooli", title: "Hooli", stage: "closed", score: 0.91 },
];
for (const deal of seedDeals) {
  try {
    const created = await coco.records.create(SPACE, TEMPLATE, {
      path: `deals/${deal.slug}`,
      title: deal.title,
      metadata: { stage: deal.stage, "conviction-score": deal.score },
    });
    console.log(`+ ${created.path} (v${created.version}) — metadata:`, created.metadata);
  } catch (error) {
    // The record is already there from a previous run: the API answers 400
    // ("template/metadata only apply when creating") or 428 (If-Match wanted).
    const alreadyExists =
      error instanceof CocoPreconditionRequiredError ||
      (error instanceof CocoValidationError && /only apply when creating/i.test(error.message));
    if (alreadyExists) {
      console.log(`= deals/${deal.slug} already exists, skipping`);
    } else {
      throw error;
    }
  }
}

heading("3. Schema enforcement: a bad stage never lands");
try {
  await coco.pages.patchMetadata(`${SPACE}/deals/acme`, { set: { stage: "wonn" } });
} catch (error) {
  if (error instanceof CocoValidationError) {
    console.log(`Rejected as expected → ${error.status}: kept the pipeline clean`);
  } else {
    throw error;
  }
}

heading("4. Patch metadata without a page revision");
const patched = await coco.pages.patchMetadata(`${SPACE}/deals/acme`, {
  set: { stage: "diligence", "last-reviewed": new Date().toISOString().slice(0, 10) },
  // appendUnique is idempotent — re-running this script never duplicates.
  appendUnique: { sources: ["https://news.example/acme-series-b"] },
});
console.log(`Metadata on ${patched.path}:`, patched.metadata);

heading("5. Update the memo body with optimistic concurrency");
const memo = await coco.pages.get(`${SPACE}/deals/acme`);
const updated = await coco.pages.update(memo.path, {
  content: `${memo.content}\n\n- ${new Date().toISOString().slice(0, 10)}: management call folded in by the SDK example.`,
  expectedVersion: memo.version, // stale version → CocoVersionConflictError (412)
  note: "Diligence log entry",
});
console.log(`${updated.path} is now v${updated.version}`);

heading("6. Who changed what (per-key audit trail)");
const history = await coco.pages.metadataHistory(`${SPACE}/deals/acme`, { limit: 5 });
printTable(
  history.items.map((event) => ({
    key: event.key,
    op: event.op,
    value: JSON.stringify(event.value),
    by: event.actorLabel,
    at: event.createdAt,
  })),
);

console.log("\nDone. Run example 01 to pull this data, or 03 to chart it.");
