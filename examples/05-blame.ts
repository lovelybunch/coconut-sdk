// Example 05 — Blame a page: who wrote each line, and when.
//
// Every page is versioned, and every metadata key carries its own audit trail.
// This example stitches the two together for one page:
//   1. Replays the page's revisions oldest → newest and, git-blame style,
//      attributes each line of the current body to the revision (and author)
//      that introduced it.
//   2. Prints one timeline: revisions interleaved with metadata events.
//   3. Rolls the page back to its first revision with make-latest, then rolls
//      it forward again — both are new revisions, so nothing is ever lost.
//
//   pnpm example:blame
//   COCO_PAGE=demo/deals/globex pnpm example:blame
//
// Env: COCO_BASE_URL, COCO_API_KEY, COCO_SPACE (see shared.ts), COCO_PAGE.
// Run example 02 first — twice is better, the memo picks up more revisions.

import type { PageVersion } from "../src/index.js";
import { createClientFromEnv, heading, printTable, SPACE } from "./shared.js";

const coco = createClientFromEnv();
const PAGE = process.env.COCO_PAGE ?? `${SPACE}/deals/acme`;

// ANSI color only on a TTY, and never when NO_COLOR is set.
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: string, text: string): string => (useColor ? `[${code}m${text}[0m` : text);
const byActor = (type: "human" | "agent", text: string): string => paint(type === "human" ? "36" : "35", text);

// --- Line attribution --------------------------------------------------------

type BlamedLine = { text: string; version: number };

/**
 * Longest-common-subsequence line diff. Returns [oldIndex, newIndex] pairs of
 * lines that survived unchanged between the two revisions. Pages are small,
 * so the quadratic table is fine here.
 */
function lcsMatches(before: string[], after: string[]): Array<[number, number]> {
  const rows = before.length;
  const cols = after.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i][j] =
        before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (before[i] === after[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

/**
 * Carries attribution forward: surviving lines keep their origin, new lines
 * get `version`. A non-blank line that reappears after being removed is
 * credited to the revision where it first appeared (`firstSeen`), so a
 * rollback-and-restore doesn't steal credit from the original author.
 */
function blameStep(
  previous: BlamedLine[],
  nextLines: string[],
  version: number,
  firstSeen: Map<string, number>,
): BlamedLine[] {
  const survivors = new Map(
    lcsMatches(previous.map((line) => line.text), nextLines).map(([oldIndex, newIndex]) => [newIndex, oldIndex]),
  );
  return nextLines.map((text, index) => {
    const from = survivors.get(index);
    if (from !== undefined) return { text, version: previous[from].version };
    if (!text.trim()) return { text, version };
    const origin = firstSeen.get(text) ?? version;
    firstSeen.set(text, origin);
    return { text, version: origin };
  });
}

// --- 1. Revisions and blame --------------------------------------------------

heading(`Revisions of ${PAGE}`);
const history = await coco.pages.versions(PAGE);
const versions: PageVersion[] = [...history.items].sort((left, right) => left.version - right.version);
printTable(
  versions.map((revision) => ({
    version: `v${revision.version}`,
    by: revision.authorLabel,
    type: revision.authorType,
    note: revision.note ?? "",
    at: revision.createdAt,
  })),
);

// The JSON envelope separates body from frontmatter, so we blame prose only.
const bodies = new Map<number, string[]>(
  await Promise.all(
    versions.map(async (revision): Promise<[number, string[]]> => {
      const page = await coco.pages.get(PAGE, { version: revision.version });
      return [revision.version, page.content.split("\n")];
    }),
  ),
);

let blamed: BlamedLine[] = [];
const firstSeen = new Map<string, number>();
for (const revision of versions) {
  blamed = blameStep(blamed, bodies.get(revision.version) ?? [], revision.version, firstSeen);
}

heading(`Blame: ${PAGE} @ v${history.currentVersion}`);
const byVersion = new Map(versions.map((revision) => [revision.version, revision]));
const gutters = blamed.map((line) => {
  const revision = byVersion.get(line.version);
  return revision
    ? `v${revision.version} ${revision.authorType.padEnd(5)} ${revision.createdAt.slice(0, 10)} ${revision.authorLabel}`
    : `v${line.version}`;
});
const gutterWidth = Math.max(0, ...gutters.map((gutter) => gutter.length));
blamed.forEach((line, index) => {
  const revision = byVersion.get(line.version);
  const gutter = gutters[index].padEnd(gutterWidth);
  console.log(`${revision ? byActor(revision.authorType, gutter) : gutter} │ ${line.text}`);
});

heading("Surviving lines by revision");
printTable(
  versions
    .map((revision) => {
      const lines = blamed.filter((line) => line.version === revision.version).length;
      return {
        version: `v${revision.version}`,
        lines,
        share: blamed.length ? `${Math.round((lines / blamed.length) * 100)}%` : "0%",
        by: `${revision.authorLabel} (${revision.authorType})`,
        note: revision.note ?? "",
      };
    })
    .filter((row) => row.lines > 0),
);

// --- 2. One timeline: revisions + metadata events ----------------------------

heading("Timeline: revisions and metadata events, oldest first");
const metadata = await coco.pages.metadataHistory(PAGE, { limit: 50 });
const timeline = [
  ...versions.map((revision) => ({
    at: revision.createdAt,
    event: `revision v${revision.version}`,
    by: revision.authorLabel,
    type: revision.authorType,
    detail: revision.note ?? "(no note)",
  })),
  ...metadata.items.map((event) => ({
    at: event.createdAt,
    event: `metadata ${event.op}`,
    by: event.actorLabel,
    type: event.actorType,
    detail: `${event.key}: ${JSON.stringify(event.previousValue ?? null)} → ${JSON.stringify(event.value)}`,
  })),
].sort((left, right) => left.at.localeCompare(right.at));
for (const entry of timeline) {
  console.log(`${entry.at}  ${byActor(entry.type, `${entry.event.padEnd(22)} ${entry.by.padEnd(24)}`)} ${entry.detail}`);
}

// --- 3. Rollback is just another revision ------------------------------------

heading("Rollback is just another revision");
if (versions.length < 2) {
  console.log("Only one revision so far — re-run example 02 to add some, then come back.");
} else {
  const first = versions[0].version;
  const before = history.currentVersion;

  const rolledBack = await coco.pages.makeLatest(PAGE, first);
  const check = await coco.pages.get(PAGE);
  const matches = check.content === (bodies.get(first) ?? []).join("\n");
  console.log(
    `make-latest v${first} → v${rolledBack.version}, a copy of v${first}; v${before} is still in the history.`,
  );
  console.log(`Body now equals v${first}: ${matches}`);
  // Metadata lives beside the page, not inside revisions: stage and score
  // are untouched by the rollback, and their audit trail keeps running.

  const rolledForward = await coco.pages.makeLatest(PAGE, before);
  console.log(
    `make-latest v${before} → v${rolledForward.version}: back where we started, two revisions richer.`,
  );
  console.log(
    "Run this again and the blame gutter still credits each line to its original author, not to the rollback.",
  );
}
