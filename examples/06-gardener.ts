// Example 06 — The gardener: tend the space's link graph.
//
// Pages link to each other and the API keeps the graph: every page knows its
// outbound links (dead targets flagged) and its backlinks, and a space can
// report every dangling link at once. This example reads the graph and tends
// it:
//   0. Plants a notes page with two dangling links so there is something to
//      heal (skipped once it exists).
//   1. Walks every page's links and finds orphans (nothing links here), hubs
//      (most connected), and dangling links (targets that don't exist).
//   2. Heals the dangling links by planting stub pages — through the matching
//      record type when the target lives under a type's default path, so the
//      stub is born conforming and stamped.
//   3. Writes a "Map of content" page back into the space: a Mermaid graph of
//      the links plus the orphan/hub report, stamped with metadata so the
//      garden's health is queryable over time.
//
//   pnpm example:gardener
//
// Run example 02 first (03 too, for a richer graph). Re-runs are safe: the
// second pass finds nothing to heal and simply refreshes the map.

import type { BrokenLink, PageLinksResult, PageSummary, TemplateSummary } from "../src/index.js";
import {
  CocoNotFoundError,
  CocoPreconditionRequiredError,
  CocoValidationError,
} from "../src/index.js";
import { createClientFromEnv, heading, printTable, SPACE } from "./shared.js";

const coco = createClientFromEnv();
const MAP_PATH = `${SPACE}/reports/map`;
// Structural pages are not part of the garden: templates, the space agent,
// and the map itself (otherwise the map would give every page a backlink).
const RESERVED_PREFIXES = ["templates/", "agents/"];

/** `demo/deals/acme` → `deals/acme`. */
const relative = (path: string): string => (path.startsWith(`${SPACE}/`) ? path.slice(SPACE.length + 1) : path);
/** Link targets may arrive as `/pages/demo/deals/acme` or `demo/deals/acme`. */
const normalizeTarget = (target: string): string => target.replace(/^\/?pages\//, "").replace(/^\//, "");
const inGarden = (path: string): boolean =>
  path.startsWith(`${SPACE}/`) &&
  path !== MAP_PATH &&
  !RESERVED_PREFIXES.some((prefix) => relative(path).startsWith(prefix));

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

/** Runs a create; returns false instead of throwing when the page already exists. */
async function plant(create: () => Promise<unknown>): Promise<boolean> {
  try {
    await create();
    return true;
  } catch (error) {
    const alreadyExists =
      error instanceof CocoPreconditionRequiredError ||
      (error instanceof CocoValidationError && /only apply when creating/i.test(error.message));
    if (alreadyExists) return false;
    throw error;
  }
}

// --- 0. Plant something to heal ----------------------------------------------

heading("0. Plant a notes page with dangling links");
const notesPath = `${SPACE}/notes/partner-meeting`;
try {
  await coco.pages.get(notesPath);
  console.log(`= ${notesPath} already planted`);
} catch (error) {
  if (!(error instanceof CocoNotFoundError)) throw error;
  await coco.pages.create(notesPath, {
    title: "Partner meeting notes",
    content: [
      "# Partner meeting notes",
      "",
      `- Revisited [Acme](/pages/${SPACE}/deals/acme) — still the strongest name in diligence.`,
      `- New inbound: [Vandelay Industries](/pages/${SPACE}/deals/vandelay), intro via [Art Vandelay](/pages/${SPACE}/people/art-vandelay).`,
      `- Pipeline view: [pipeline summary](/pages/${SPACE}/reports/pipeline-summary).`,
    ].join("\n"),
    note: "Seeded by coconut-sdk example 06",
  });
  console.log(`+ ${notesPath} — links to two pages that don't exist yet`);
}

// --- 1. Read the graph -------------------------------------------------------

type Garden = {
  pages: PageSummary[];
  edges: Array<{ from: string; to: string }>;
  inbound: Map<string, number>;
  outbound: Map<string, number>;
  dangling: BrokenLink[];
};

async function readGarden(): Promise<Garden> {
  const listing = await coco.spaces.pages(SPACE);
  const pages = listing.items.filter((page) => inGarden(page.path));
  const known = new Set(pages.map((page) => page.path));
  const links: PageLinksResult[] = await mapWithConcurrency(pages, 5, (page) => coco.pages.links(page.path));

  const seen = new Set<string>();
  const edges: Array<{ from: string; to: string }> = [];
  for (const result of links) {
    for (const link of result.outbound) {
      const to = normalizeTarget(link.targetPath);
      const key = `${result.path} -> ${to}`;
      if (!link.targetExists || !known.has(to) || seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: result.path, to });
    }
  }
  const inbound = new Map(pages.map((page) => [page.path, 0]));
  const outbound = new Map(pages.map((page) => [page.path, 0]));
  for (const edge of edges) {
    inbound.set(edge.to, (inbound.get(edge.to) ?? 0) + 1);
    outbound.set(edge.from, (outbound.get(edge.from) ?? 0) + 1);
  }

  const broken = await coco.spaces.brokenLinks(SPACE, { limit: 100 });
  const dangling = broken.items.filter((link) => inGarden(link.sourcePath));
  return { pages, edges, inbound, outbound, dangling };
}

heading(`1. Walk the link graph of "${SPACE}"`);
let garden = await readGarden();
if (garden.pages.length === 0) {
  console.log("Nothing growing here — run example 02 first.");
  process.exit(1);
}
console.log(`${garden.pages.length} pages, ${garden.edges.length} links, ${garden.dangling.length} dangling`);

const orphansOf = (state: Garden): PageSummary[] =>
  state.pages.filter((page) => (state.inbound.get(page.path) ?? 0) === 0);
const hubsOf = (state: Garden) =>
  state.pages
    .map((page) => ({
      path: page.path,
      title: page.title,
      in: state.inbound.get(page.path) ?? 0,
      out: state.outbound.get(page.path) ?? 0,
    }))
    .sort((left, right) => right.in + right.out - (left.in + left.out) || left.path.localeCompare(right.path))
    .slice(0, 5);

console.log("\nOrphans (no page links here):");
printTable(orphansOf(garden).map((page) => ({ path: page.path, title: page.title })));
console.log("\nHubs (most connected):");
printTable(hubsOf(garden));
console.log("\nDangling links:");
printTable(
  garden.dangling.map((link) => ({
    from: link.sourcePath,
    to: normalizeTarget(link.targetPath),
    anchor: link.anchorText,
  })),
);

// --- 2. Heal -----------------------------------------------------------------

heading("2. Heal dangling links with stubs");
const types: TemplateSummary[] = await coco.records.types(SPACE);
const typeFor = (path: string): TemplateSummary | undefined =>
  types.find((type) => {
    const prefix = type.defaultPathPrefix?.replace(/\/$/, "");
    return prefix ? relative(path).startsWith(`${prefix}/`) : false;
  });

type Healed = { path: string; title: string; how: string; sources: string[] };
const healed: Healed[] = [];
const danglingBefore = garden.dangling.length;

const byTarget = new Map<string, BrokenLink[]>();
for (const link of garden.dangling) {
  const target = normalizeTarget(link.targetPath);
  if (!inGarden(target)) continue; // points out of the space, or into templates/agents
  byTarget.set(target, [...(byTarget.get(target) ?? []), link]);
}

for (const [target, links] of byTarget) {
  const sources = [...new Set(links.map((link) => link.sourcePath))];
  // The anchor text someone already wrote is the best title we have.
  const title =
    links.find((link) => link.anchorText.trim())?.anchorText.trim() ?? relative(target).split("/").pop() ?? target;
  const type = typeFor(target);
  const note = "Stub planted by the gardener (coconut-sdk example 06)";

  const created = type
    ? // Through the record type: the template supplies the body, the schema
      // supplies defaults (a deal stub is born in `sourcing`), and the page is
      // stamped so it shows up in record queries immediately.
      await plant(() => coco.records.create(SPACE, type.name, { path: relative(target), title, note }))
    : await plant(() =>
        coco.pages.create(target, {
          title,
          content: [
            `# ${title}`,
            "",
            `_Stub planted by the gardener. Linked from ${sources
              .map((source) => `[${source}](/pages/${source})`)
              .join(", ")} before it existed — fill me in._`,
          ].join("\n"),
          note,
        }),
      );

  const how = type ? `${type.name} record` : "plain page";
  if (created) {
    healed.push({ path: target, title, how, sources });
    console.log(`+ ${target} — "${title}" as a ${how} (linked from ${sources.join(", ")})`);
  } else {
    console.log(`= ${target} appeared while we were working, skipping`);
  }
}
if (byTarget.size === 0) console.log("Nothing dangling — the garden is healthy.");

if (healed.length > 0) {
  garden = await readGarden(); // the stubs are pages now; the map should show them
}

// --- 3. Write the map back ---------------------------------------------------

heading("3. Write the map of content back");
const orphans = orphansOf(garden);
const hubs = hubsOf(garden);
const stubPaths = new Set(healed.map((stub) => stub.path));
const nodeId = (path: string): string => `p_${relative(path).replace(/[^A-Za-z0-9]/g, "_")}`;
const mermaidLabel = (text: string): string => text.replace(/"/g, "#quot;");

const mermaid = [
  "graph LR",
  ...garden.pages.map((page) => `  ${nodeId(page.path)}["${mermaidLabel(page.title)}"]`),
  ...garden.edges.map((edge) => `  ${nodeId(edge.from)} --> ${nodeId(edge.to)}`),
  "  classDef orphan stroke-dasharray: 4 2;",
  "  classDef stub stroke-width: 3px;",
  ...(orphans.length ? [`  class ${orphans.map((page) => nodeId(page.path)).join(",")} orphan;`] : []),
  ...(stubPaths.size ? [`  class ${[...stubPaths].map(nodeId).join(",")} stub;`] : []),
].join("\n");

const today = new Date().toISOString().slice(0, 10);
const mapMarkdown = [
  "# Map of content",
  "",
  `_Tended on ${today} by the gardener (coconut-sdk example 06): ${garden.pages.length} pages, ${garden.edges.length} links. Dashed nodes are orphans; bold nodes were planted this pass. Templates, the space agent, and this map are not part of the garden._`,
  "",
  "```mermaid",
  mermaid,
  "```",
  "",
  `## Orphans (${orphans.length})`,
  "",
  ...(orphans.length
    ? orphans.map((page) => `- [${page.title}](/pages/${page.path}) — nothing links here yet`)
    : ["Every page has at least one inbound link."]),
  "",
  "## Hubs",
  "",
  "| Page | Inbound | Outbound |",
  "|---|---|---|",
  ...hubs.map((hub) => `| [${hub.title}](/pages/${hub.path}) | ${hub.in} | ${hub.out} |`),
  "",
  `## Healed this pass (${healed.length})`,
  "",
  ...(healed.length
    ? healed.map(
        (stub) =>
          `- [${stub.title}](/pages/${stub.path}) — planted as a ${stub.how}, linked from ${stub.sources
            .map((source) => `[${source}](/pages/${source})`)
            .join(", ")}`,
      )
    : [danglingBefore === 0 ? "No dangling links found." : "Dangling links pointed outside the garden; left alone."]),
].join("\n");

const map = await coco.pages.upsert(MAP_PATH, {
  title: "Map of content",
  content: mapMarkdown,
  note: `Tended by coconut-sdk example 06 (${healed.length} stub${healed.length === 1 ? "" : "s"} planted)`,
});
await coco.pages.patchMetadata(map.path, {
  set: {
    "report-kind": "map-of-content",
    "page-count": garden.pages.length,
    "link-count": garden.edges.length,
    "orphan-count": orphans.length,
    "dangling-before": danglingBefore,
    "stubs-planted": healed.length,
    "generated-at": new Date().toISOString(),
  },
});
console.log(`Wrote ${map.path} (v${map.version}) — a Mermaid graph of the space plus the orphan and hub report.`);
console.log(
  "The metadata stamp makes the garden's health queryable: chart orphan-count over time, or alert when dangling-before > 0.",
);
