// resumeGenerate() with data that fails the tool's resumeSchema consumes the suspension.
// Mock model, in-memory storage, no network.
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { InMemoryStore } from "@mastra/core/storage";
import { MastraLanguageModelV2Mock } from "@mastra/core/test-utils/llm-mock";
import { createTool } from "@mastra/core/tools";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

const ask = createTool({
  id: "ask",
  description: "asks the user a question",
  inputSchema: z.object({}),
  suspendSchema: z.object({ question: z.string() }),
  resumeSchema: z.object({ text: z.string() }),
  execute: async (_input, ctx) => {
    if (ctx.agent?.resumeData) return `The user answered: ${ctx.agent.resumeData.text}`;
    return await ctx.agent?.suspend({ question: "Which one?" });
  },
});

let calls = 0;
let toolResultSeenByModel = "";
const model = new MastraLanguageModelV2Mock({
  doGenerate: async (options: any) => {
    const step = calls++;
    if (step === 1) {
      toolResultSeenByModel = JSON.stringify(
        options.prompt.filter((m: any) => m.role === "tool").flatMap((m: any) => m.content.map((p: any) => p.output)),
      );
    }
    return {
      content:
        step === 0 ? [{ type: "tool-call", toolCallId: "call-0", toolName: "ask", input: "{}" }] : [{ type: "text", text: "done" }],
      finishReason: step === 0 ? "tool-calls" : "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    } as any;
  },
});
const agent = new Agent({ id: "a", name: "a", instructions: "x", model, tools: { ask } });
new Mastra({ agents: { a: agent }, storage: new InMemoryStore(), logger: false });
const suspendedRuns = async () => (await agent.listSuspendedRuns()).runs.length;

const first = await agent.generate("Go", { maxSteps: 5 });
console.log("generate ->", first.finishReason, "| suspended runs:", await suspendedRuns());

const resume = (data: unknown) =>
  agent.resumeGenerate(data, { runId: first.runId, toolCallId: first.suspendPayload.toolCallId, maxSteps: 5 });

// Data that does not match resumeSchema { text: string }
const second = await resume({ nope: 1 });
console.log(`resumeGenerate({ nope: 1 }) -> ${second.finishReason}, text "${second.text}" (no throw, not suspended)`);
console.log("tool result the model read:", toolResultSeenByModel);
console.log("suspended runs:", await suspendedRuns());
try {
  await resume({ text: "Warm" });
  console.log("retry with valid data: ok");
} catch (e: any) {
  console.log("retry with valid data throws:", e.id ?? e.message);
}

// Contrast: a workflow step with the same resumeSchema refuses wrong data and stays suspended.
const step = createStep({
  id: "ask",
  inputSchema: z.object({}),
  outputSchema: z.object({ answer: z.string() }),
  suspendSchema: z.object({ question: z.string() }),
  resumeSchema: z.object({ text: z.string() }),
  execute: async ({ resumeData, suspend }) =>
    resumeData ? { answer: resumeData.text } : await suspend({ question: "Which one?" }),
});
const wf = createWorkflow({ id: "wf", inputSchema: z.object({}), outputSchema: z.object({ answer: z.string() }) })
  .then(step)
  .commit();
const wfMastra = new Mastra({ workflows: { wf }, storage: new InMemoryStore(), logger: false });
const run = await wfMastra.getWorkflow("wf").createRun();
await run.start({ inputData: {} });
try {
  await run.resume({ step: "ask", resumeData: { nope: 1 } as any });
} catch (e: any) {
  console.log("workflow, wrong data throws:", String(e.message).replace(/\n/g, " ").slice(0, 80));
}
console.log("workflow, then valid data:", (await run.resume({ step: "ask", resumeData: { text: "Warm" } })).status);
