// Shared by every process of the repro. Public APIs only. No real model: MastraLanguageModelV2Mock.
// Storage: @mastra/pg (PostgresStore), because the resume claim is cross-process only on stores with
// supportsConcurrentUpdates() (Postgres, LibSQL, MongoDB, in-memory). DATABASE_URL must point at an empty database.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { MastraLanguageModelV2Mock } from "@mastra/core/test-utils/llm-mock";
import { createTool } from "@mastra/core/tools";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { PostgresStore } from "@mastra/pg";
import { z } from "zod";

export const ROLE = process.env.ROLE ?? "?";
export const OUT = process.env.OUT ?? join(import.meta.dirname, "out");
export const OBS = join(OUT, "observations.jsonl");
export const WORKFLOW_ID = "issue11";
export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
mkdirSync(OUT, { recursive: true });
export const obs = (event: Record<string, unknown>) =>
  appendFileSync(OBS, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, role: ROLE, ...event }) + "\n");

// The tool suspends the agent's loop and returns the answer once it is resumed.
const ask = createTool({
  id: "ask",
  description: "Asks the user a question and waits for the answer.",
  inputSchema: z.object({ question: z.string() }),
  suspendSchema: z.object({ question: z.string() }),
  resumeSchema: z.object({ text: z.string() }),
  execute: async ({ question }, context) => {
    if (context.agent?.resumeData) return `The user answered: ${context.agent.resumeData.text}`;
    return await context.agent?.suspend({ question });
  },
});

// First model call: call the tool. Every later call (after the resume): the process named HANG_ROLE hangs, so
// it can be killed while the resumed loop is running; any other process answers "Final".
const model = new MastraLanguageModelV2Mock({
  doGenerate: async ({ prompt }) => {
    const resumed = JSON.stringify(prompt).includes("The user answered");
    obs({ ev: "model.call", resumed });
    if (resumed && ROLE === (process.env.HANG_ROLE ?? "w1")) {
      obs({ ev: "model.hangs" });
      await sleep(600_000);
    }
    return resumed
      ? { content: [{ type: "text" as const, text: "Final" }], finishReason: "stop" as const, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [] }
      : {
          content: [{ type: "tool-call" as const, toolCallId: "call-1", toolName: "ask", input: JSON.stringify({ question: "Warm or cool?" }) }],
          finishReason: "tool-calls" as const,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          warnings: [],
        };
  },
});

export const agent = new Agent({ id: "asker", name: "asker", instructions: "Ask, then finish.", model, tools: { ask } });

// The workflow step drives the agent: the first leg suspends the step with the agent's run id, the resumed step
// resumes the agent's loop with the answer. This is the documented way to wait for a person across processes.
const record = z.object({ agentRunId: z.string(), toolCallId: z.string() });
export const turn = createStep({
  id: "turn",
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ text: z.string() }),
  suspendSchema: record,
  resumeSchema: z.object({ text: z.string() }),
  execute: async ({ resumeData, suspendData, suspend, mastra }) => {
    const asker = mastra.getAgent("asker");
    if (resumeData === undefined) {
      const first = await asker.generate("Go", { maxSteps: 5 });
      obs({ ev: "step.firstLeg", finishReason: first.finishReason, agentRunId: first.runId });
      return await suspend({ agentRunId: first.runId!, toolCallId: (first as any).suspendPayload.toolCallId });
    }
    obs({ ev: "step.resumedLeg", suspendData: suspendData ?? "(undefined)" });
    try {
      const out = await asker.resumeGenerate(resumeData, { runId: suspendData!.agentRunId, toolCallId: suspendData!.toolCallId, maxSteps: 5 });
      obs({ ev: "step.resumeGenerate.ok", text: out.text });
      return { text: out.text };
    } catch (error: any) {
      obs({ ev: "step.resumeGenerate.error", id: error?.id, message: String(error?.message).slice(0, 200) });
      throw error;
    }
  },
});

export const storage = () => new PostgresStore({ id: "issue11", connectionString: process.env.DATABASE_URL! });

export const loopRow = async (mastra: Mastra, agentRunId: string) => {
  const row: any = await (await mastra.getStorage()!.getStore("workflows"))!.loadWorkflowSnapshot({ workflowName: "agentic-loop", runId: agentRunId });
  return row ? { status: row.status, resumeClaimedAt: row.resumeClaimedAt ?? null } : null;
};

export const defaultWorkflow = () =>
  createWorkflow({ id: WORKFLOW_ID, inputSchema: z.object({ topic: z.string() }), outputSchema: z.object({ text: z.string() }) })
    .then(turn)
    .commit();
