// Shared setup for the examples: one client configured from the environment,
// pointed at a local dev stack of the product by default.

import { CocoClient } from "../src/index.js";

export const SPACE = process.env.COCO_SPACE ?? "demo";
export const TEMPLATE = process.env.COCO_TEMPLATE ?? "deal-memo";

export function createClientFromEnv(): CocoClient {
  return new CocoClient({
    baseUrl: process.env.COCO_BASE_URL ?? "http://localhost:8787",
    // Local dev stacks seed this dev key; real deployments mint keys
    // at POST /admin/agent-keys (they look like `coco_...`).
    apiKey: process.env.COCO_API_KEY ?? "dev-agent-key-change-me",
    orgSlug: process.env.COCO_ORG_SLUG,
  });
}

export function heading(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/** Renders rows as a plain fixed-width console table. */
export function printTable(rows: Array<Record<string, unknown>>): void {
  if (rows.length === 0) {
    console.log("(no rows)");
    return;
  }
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, index) => cell.padEnd(widths[index])).join("  ");
  console.log(line(columns));
  console.log(line(widths.map((width) => "-".repeat(width))));
  for (const row of rows) {
    console.log(line(columns.map((column) => String(row[column] ?? ""))));
  }
}
