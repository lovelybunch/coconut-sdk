// Example 03 — Pull records, chart them, write the summary back.
//
//   1. Queries the deal records seeded by example 02 (metadata query).
//   2. Renders a self-contained HTML dashboard — stat tiles + a horizontal
//      bar chart of deals per stage (inline SVG, no chart library) with a
//      table view — to examples/out/pipeline-dashboard.html.
//   3. Writes a markdown pipeline summary back into the space, stamped with
//      metadata so it is itself queryable.
//
//   pnpm example:visualize

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClientFromEnv, heading, SPACE, TEMPLATE } from "./shared.js";

const coco = createClientFromEnv();

heading(`Pull "${TEMPLATE}" records from "${SPACE}"`);
const records = await coco.records.query(SPACE, TEMPLATE, { limit: 100 });
if (records.items.length === 0) {
  console.log("No records found — run example 02 first.");
  process.exit(1);
}

type Row = { path: string; title: string; stage: string; score: number | null };
const rows: Row[] = records.items.map((item) => ({
  path: item.path,
  title: item.title,
  stage: String(item.metadata?.stage ?? "unknown"),
  score:
    typeof item.metadata?.["conviction-score"] === "number"
      ? (item.metadata["conviction-score"] as number)
      : null,
}));

const stageOrder = ["sourcing", "diligence", "closed"];
const stages = [...new Set([...stageOrder.filter((s) => rows.some((r) => r.stage === s)), ...rows.map((r) => r.stage)])];
const byStage = stages.map((stage) => {
  const inStage = rows.filter((row) => row.stage === stage);
  const scored = inStage.filter((row) => row.score !== null);
  return {
    stage,
    count: inStage.length,
    avgScore: scored.length
      ? scored.reduce((sum, row) => sum + (row.score ?? 0), 0) / scored.length
      : null,
  };
});
const scoredRows = rows.filter((row) => row.score !== null);
const avgScore = scoredRows.length
  ? scoredRows.reduce((sum, row) => sum + (row.score ?? 0), 0) / scoredRows.length
  : 0;
console.log(`${rows.length} records across ${stages.length} stages`);

// --- Render the dashboard ---------------------------------------------------
// Colors are the reference dataviz palette (categorical slot 1 + chart chrome),
// declared once as CSS custom properties with a selected dark mode.

const maxCount = Math.max(...byStage.map((entry) => entry.count));
const BAR_H = 22; // thin marks
const GAP = 2; // surface gap between adjacent bars
const ROW_H = BAR_H + GAP + 14;
const LABEL_W = 96;
const VALUE_W = 40;
const PLOT_W = 480;
const chartH = byStage.length * ROW_H;

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const bars = byStage
  .map((entry, index) => {
    const width = Math.max(4, Math.round((entry.count / maxCount) * PLOT_W));
    const y = index * ROW_H;
    // Rounded data-end only: square at the baseline, 4px radius at the free end.
    const r = 4;
    const barPath = `M0 ${y} h${width - r} a${r} ${r} 0 0 1 ${r} ${r} v${BAR_H - 2 * r} a${r} ${r} 0 0 1 -${r} ${r} h-${width - r} Z`;
    const scoreLabel = entry.avgScore === null ? "n/a" : entry.avgScore.toFixed(2);
    return `
      <g class="bar-row">
        <text class="cat-label" x="-8" y="${y + BAR_H / 2}" text-anchor="end" dominant-baseline="central">${escapeHtml(entry.stage)}</text>
        <path class="bar" d="${barPath}"><title>${escapeHtml(entry.stage)}: ${entry.count} deal${entry.count === 1 ? "" : "s"}, avg conviction ${scoreLabel}</title></path>
        <text class="value-label" x="${width + 8}" y="${y + BAR_H / 2}" dominant-baseline="central">${entry.count}</text>
      </g>`;
  })
  .join("\n");

// Integer ticks only — counts are whole numbers, so fractional divisions
// would round into duplicate labels.
const tickValues = [
  ...new Set(
    Array.from({ length: Math.min(4, maxCount) }, (_, index) =>
      Math.round(((index + 1) / Math.min(4, maxCount)) * maxCount),
    ),
  ),
];
const gridLines = tickValues
  .map((value) => {
    const x = Math.round((value / maxCount) * PLOT_W);
    return `<line class="grid" x1="${x}" y1="0" x2="${x}" y2="${chartH}" /><text class="tick" x="${x}" y="${chartH + 16}" text-anchor="middle">${value}</text>`;
  })
  .join("\n");

const tableRows = rows
  .map(
    (row) =>
      `<tr><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.stage)}</td><td class="num">${row.score === null ? "—" : row.score.toFixed(2)}</td><td class="path">${escapeHtml(row.path)}</td></tr>`,
  )
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pipeline dashboard — ${escapeHtml(SPACE)}</title>
<style>
  .viz-root {
    color-scheme: light;
    --page:           #f9f9f7;
    --surface-1:      #fcfcfb;
    --text-primary:   #0b0b0b;
    --text-secondary: #52514e;
    --text-muted:     #898781;
    --gridline:       #e1e0d9;
    --baseline:       #c3c2b7;
    --border:         rgba(11, 11, 11, 0.10);
    --series-1:       #2a78d6;
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) .viz-root {
      color-scheme: dark;
      --page:           #0d0d0d;
      --surface-1:      #1a1a19;
      --text-primary:   #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted:     #898781;
      --gridline:       #2c2c2a;
      --baseline:       #383835;
      --border:         rgba(255, 255, 255, 0.10);
      --series-1:       #3987e5;
    }
  }
  :root[data-theme="dark"] .viz-root {
    color-scheme: dark;
    --page:           #0d0d0d;
    --surface-1:      #1a1a19;
    --text-primary:   #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted:     #898781;
    --gridline:       #2c2c2a;
    --baseline:       #383835;
    --border:         rgba(255, 255, 255, 0.10);
    --series-1:       #3987e5;
  }
  .viz-root {
    margin: 0;
    background: var(--page);
    color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 32px 24px;
  }
  .frame { max-width: 760px; margin: 0 auto; display: grid; gap: 16px; }
  h1 { font-size: 18px; margin: 0; }
  .subtitle { color: var(--text-secondary); font-size: 13px; margin: 0; }
  .card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 20px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
  .tile .label { color: var(--text-secondary); font-size: 12px; }
  .tile .value { font-size: 32px; font-weight: 600; margin-top: 4px; }
  .chart-title { font-size: 13px; font-weight: 600; margin: 0 0 12px; }
  svg { display: block; width: 100%; height: auto; }
  .bar { fill: var(--series-1); }
  .bar-row:hover .bar { opacity: 0.8; }
  .cat-label { fill: var(--text-secondary); font-size: 12px; }
  .value-label { fill: var(--text-primary); font-size: 12px; font-weight: 600; }
  .tick { fill: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .grid { stroke: var(--gridline); stroke-width: 1; }
  .axis { stroke: var(--baseline); stroke-width: 1; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: var(--text-secondary); font-weight: 500; padding: 6px 8px; border-bottom: 1px solid var(--baseline); }
  td { padding: 6px 8px; border-bottom: 1px solid var(--gridline); }
  td.num { font-variant-numeric: tabular-nums; }
  td.path { color: var(--text-muted); }
</style>
</head>
<body class="viz-root">
  <div class="frame">
    <div>
      <h1>Deal pipeline — ${escapeHtml(SPACE)}</h1>
      <p class="subtitle">Live from ${escapeHtml(TEMPLATE)} records via coconut-sdk · ${new Date().toISOString().slice(0, 10)}</p>
    </div>
    <div class="tiles">
      <div class="card tile"><div class="label">Deals</div><div class="value">${rows.length}</div></div>
      <div class="card tile"><div class="label">In diligence</div><div class="value">${rows.filter((row) => row.stage === "diligence").length}</div></div>
      <div class="card tile"><div class="label">Avg conviction</div><div class="value">${avgScore.toFixed(2)}</div></div>
    </div>
    <div class="card">
      <p class="chart-title">Deals per stage</p>
      <svg viewBox="0 0 ${LABEL_W + PLOT_W + VALUE_W} ${chartH + 24}" role="img" aria-label="Bar chart of deals per pipeline stage">
        <g transform="translate(${LABEL_W}, 0)">
          ${gridLines}
          <line class="axis" x1="0" y1="0" x2="0" y2="${chartH}" />
          ${bars}
        </g>
      </svg>
    </div>
    <div class="card">
      <p class="chart-title">Records</p>
      <table>
        <thead><tr><th>Deal</th><th>Stage</th><th>Conviction</th><th>Page</th></tr></thead>
        <tbody>
${tableRows}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>
`;

const outDir = join(dirname(fileURLToPath(import.meta.url)), "out");
await mkdir(outDir, { recursive: true });
const outFile = join(outDir, "pipeline-dashboard.html");
await writeFile(outFile, html, "utf8");
heading("Dashboard rendered");
console.log(outFile);

// --- Write the summary back into the space ----------------------------------

heading("Write the summary back");
const summaryMarkdown = [
  "# Pipeline summary",
  "",
  `_Generated from ${rows.length} [${TEMPLATE}](/pages/${SPACE}/templates/${TEMPLATE}) records._`,
  "",
  "| Stage | Deals | Avg conviction |",
  "|---|---|---|",
  ...byStage.map(
    (entry) =>
      `| ${entry.stage} | ${entry.count} | ${entry.avgScore === null ? "n/a" : entry.avgScore.toFixed(2)} |`,
  ),
  "",
  "Top of the pipeline:",
  "",
  ...rows
    .filter((row) => row.score !== null)
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, 3)
    .map((row) => `- [${row.title}](/pages/${row.path}) — ${row.stage}, conviction ${row.score?.toFixed(2)}`),
].join("\n");

const report = await coco.pages.upsert(`${SPACE}/reports/pipeline-summary`, {
  title: "Pipeline summary",
  content: summaryMarkdown,
  note: "Regenerated by coconut-sdk example 03",
});
await coco.pages.patchMetadata(report.path, {
  set: {
    "report-kind": "pipeline-summary",
    "record-count": rows.length,
    "avg-conviction": Number(avgScore.toFixed(3)),
    "generated-at": new Date().toISOString(),
  },
});
console.log(`Wrote ${report.path} (v${report.version}) — internal links land in the link graph,`);
console.log("and the metadata stamp makes the report itself queryable.");
