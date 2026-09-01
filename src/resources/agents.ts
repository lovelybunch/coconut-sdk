// Space agents: every space has exactly one agent, defined by pages in its
// space (`agents/instructions`, `agents/<task>`, `agents/runs/<task>/<id>`).
// REST parity with the agent_* MCP tool family — rollups, tasks, async run
// triggers with polling, run records, and the agent persona.

import { CocoHttp, encodePagePath } from "../http.js";
import { CocoError } from "../errors.js";
import type {
  AgentInstructions,
  AgentListResult,
  AgentModelsResult,
  AgentRunDetail,
  AgentRunListResult,
  AgentRunStatus,
  AgentRunTriggerResult,
  AgentTaskDetail,
  AgentTaskListResult,
  PageWriteResult,
  WriteAgentTaskOptions,
} from "../types.js";

const TERMINAL_RUN_STATUSES: ReadonlySet<AgentRunStatus> = new Set(["completed", "failed", "unknown"]);

export class AgentsApi {
  constructor(private readonly http: CocoHttp) {}

  /** Per-space agent rollups for every space the caller can see. */
  list(): Promise<AgentListResult> {
    return this.http.requestJson<AgentListResult>("GET", "/agents");
  }

  /** Admin-enabled models a task's `model` frontmatter key may pin. */
  models(): Promise<AgentModelsResult> {
    return this.http.requestJson<AgentModelsResult>("GET", "/agents/models");
  }

  /** A space agent's tasks with run stats, most recently run first. */
  listTasks(spaceSlug: string, options: { limit?: number } = {}): Promise<AgentTaskListResult> {
    return this.http.requestJson<AgentTaskListResult>(
      "GET",
      `/spaces/${encodeURIComponent(spaceSlug)}/agent/tasks`,
      { query: { limit: options.limit } },
    );
  }

  /** One task in full — markdown, frontmatter (schedule), and recent runs. */
  getTask(spaceSlug: string, task: string, options: { runsLimit?: number } = {}): Promise<AgentTaskDetail> {
    return this.http.requestJson<AgentTaskDetail>(
      "GET",
      `/spaces/${encodeURIComponent(spaceSlug)}/agent/tasks/${encodePagePath(task)}`,
      { query: { limit: options.runsLimit } },
    );
  }

  /**
   * Creates a task (`<space>/agents/<task>`, expects 201). Scheduling rides
   * in frontmatter: `schedule` (5-field cron), `scheduleTz`, `scheduleEnabled`.
   */
  createTask(spaceSlug: string, task: string, options: WriteAgentTaskOptions): Promise<PageWriteResult> {
    return this.http.requestJson<PageWriteResult>(
      "PUT",
      `/spaces/${encodeURIComponent(spaceSlug)}/agent/tasks/${encodePagePath(task)}`,
      { body: options },
    );
  }

  /** Updates an existing task; `expectedVersion` is sent as `If-Match`. */
  updateTask(
    spaceSlug: string,
    task: string,
    options: WriteAgentTaskOptions & { expectedVersion: number },
  ): Promise<PageWriteResult> {
    const { expectedVersion, ...body } = options;
    return this.http.requestJson<PageWriteResult>(
      "PUT",
      `/spaces/${encodeURIComponent(spaceSlug)}/agent/tasks/${encodePagePath(task)}`,
      { body, ifMatchVersion: expectedVersion },
    );
  }

  /**
   * Queues one run (202) and returns immediately with the run record's id.
   * Poll `getRun`, or use `waitForRun` / `runTaskAndWait`.
   */
  runTask(spaceSlug: string, task: string): Promise<AgentRunTriggerResult> {
    return this.http.requestJson<AgentRunTriggerResult>(
      "POST",
      `/spaces/${encodeURIComponent(spaceSlug)}/agent/tasks/${encodePagePath(task)}/runs`,
    );
  }

  /** A task's run records, newest first. `status` filters by presented status. */
  listRuns(
    spaceSlug: string,
    task: string,
    options: { limit?: number; status?: AgentRunStatus } = {},
  ): Promise<AgentRunListResult> {
    return this.http.requestJson<AgentRunListResult>(
      "GET",
      `/spaces/${encodeURIComponent(spaceSlug)}/agent/tasks/${encodePagePath(task)}/runs`,
      { query: { limit: options.limit, status: options.status } },
    );
  }

  /** One run record — status, timing, usage, markdown output, transcript. */
  getRun(
    spaceSlug: string,
    runId: string,
    options: { includeTranscript?: boolean } = {},
  ): Promise<AgentRunDetail> {
    return this.http.requestJson<AgentRunDetail>(
      "GET",
      `/spaces/${encodeURIComponent(spaceSlug)}/agent/runs/${encodeURIComponent(runId)}`,
      { query: { includeTranscript: options.includeTranscript ? "true" : undefined } },
    );
  }

  /**
   * Polls a queued run until it reaches a terminal status (completed, failed,
   * or unknown). Stale queued/running records present as failed server-side,
   * so polling always terminates well before `timeoutMs` in practice.
   */
  async waitForRun(
    spaceSlug: string,
    runId: string,
    options: { pollIntervalMs?: number; timeoutMs?: number; includeTranscript?: boolean } = {},
  ): Promise<AgentRunDetail> {
    const pollIntervalMs = options.pollIntervalMs ?? 3000;
    const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const run = await this.getRun(spaceSlug, runId, {
        includeTranscript: options.includeTranscript,
      });
      if (TERMINAL_RUN_STATUSES.has(run.status)) return run;
      if (Date.now() + pollIntervalMs > deadline) {
        throw new CocoError(
          `Timed out after ${timeoutMs}ms waiting for run ${runId} (last status: ${run.status}).`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  /** Triggers a run and waits for its terminal record. */
  async runTaskAndWait(
    spaceSlug: string,
    task: string,
    options: { pollIntervalMs?: number; timeoutMs?: number; includeTranscript?: boolean } = {},
  ): Promise<AgentRunDetail> {
    const queued = await this.runTask(spaceSlug, task);
    return this.waitForRun(spaceSlug, queued.runId, options);
  }

  /** The agent persona; `exists: false` (not a 404) before it's first written. */
  getInstructions(spaceSlug: string): Promise<AgentInstructions> {
    return this.http.requestJson<AgentInstructions>(
      "GET",
      `/spaces/${encodeURIComponent(spaceSlug)}/agent/instructions`,
    );
  }

  /** Creates (201) or updates (needs `expectedVersion`) the agent persona. */
  setInstructions(
    spaceSlug: string,
    options: { content: string; title?: string; expectedVersion?: number },
  ): Promise<PageWriteResult> {
    const { expectedVersion, ...body } = options;
    return this.http.requestJson<PageWriteResult>(
      "PUT",
      `/spaces/${encodeURIComponent(spaceSlug)}/agent/instructions`,
      { body, ifMatchVersion: expectedVersion },
    );
  }
}
