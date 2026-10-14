// resumeGenerate() writes the run's messages to the thread although memory.options.readOnly is true.
// Uses the mock model and in-memory storage: no network, no database.
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { InMemoryStore } from "@mastra/core/storage";
import { MastraLanguageModelV2Mock } from "@mastra/core/test-utils/llm-mock";
import { createTool } from "@mastra/core/tools";
import { Memory } from "@mastra/memory";
import { z } from "zod";

// The mock model reads the tool calls already in its prompt and plays: lookup, then ask, then answer.
// A prompt that contains PLAIN never calls `ask`, so that run never suspends.
const model = new MastraLanguageModelV2Mock({
  doGenerate: async ({ prompt }: any) => {
    const done = prompt.flatMap((m: any) => (m.role === "assistant" ? m.content : [])).filter((p: any) => p.type === "tool-call").length;
    const tool = (JSON.stringify(prompt).includes("PLAIN") ? ["lookup"] : ["lookup", "ask"])[done];
    return {
      content: tool
        ? [{ type: "tool-call", toolCallId: `call-${tool}`, toolName: tool, input: "{}" }]
        : [{ type: "text", text: "done" }],
      finishReason: tool ? "tool-calls" : "stop",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    };
  },
});

const lookup = createTool({ id: "lookup", description: "lookup", inputSchema: z.object({}), execute: async () => "found" });
const ask = createTool({
  id: "ask",
  description: "ask the user",
  inputSchema: z.object({}),
  suspendSchema: z.object({ q: z.string() }),
  resumeSchema: z.object({ text: z.string() }),
  execute: async (_input, ctx) => {
    if (!ctx.agent?.resumeData) return await ctx.agent?.suspend({ q: "Which one?" });
    console.log("inside ask, on resume, rows already:", await show("t1")); // the tool has not returned yet
    return `answer: ${ctx.agent.resumeData.text}`;
  },
});

const memory = new Memory({ options: { lastMessages: 20, semanticRecall: false } });
const agent = new Agent({ id: "a", name: "a", instructions: "x", model, tools: { lookup, ask }, memory });
new Mastra({ agents: { a: agent }, storage: new InMemoryStore(), logger: false });
await agent.getMemory(); // the memory picks up the Mastra storage
await memory.createThread({ threadId: "t1", resourceId: "r1" });
await memory.createThread({ threadId: "control", resourceId: "r1" });

const readOnly = (threadId: string) => ({ thread: threadId, resource: "r1", options: { readOnly: true } });
const rows = async (threadId: string) => (await memory.recall({ threadId, resourceId: "r1" })).messages;
const show = async (threadId: string) => (await rows(threadId)).map(m => `${m.role}:${m.id.slice(0, 8)}`);

// Control: a run that never suspends writes nothing into a readOnly thread.
await agent.generate("PLAIN", { memory: readOnly("control"), maxSteps: 6 });
console.log("control, run without suspension:   ", await show("control"));

console.log("t1 before the run:                 ", await show("t1"));
const first = await agent.generate("Go", { memory: readOnly("t1"), maxSteps: 6 });
console.log(`t1 after generate (${first.finishReason}):`.padEnd(35), await show("t1"));
const second = await agent.resumeGenerate(
  { text: "Warm" },
  { runId: first.runId, toolCallId: first.suspendPayload.toolCallId, memory: readOnly("t1"), maxSteps: 6 },
);
console.log(`t1 after resumeGenerate (${second.text}):`.padEnd(35), await show("t1"));

const assistant = (await rows("t1")).find(m => m.role === "assistant");
const parts = (assistant?.content.parts ?? []) as any[];
console.log("parts of the assistant row:        ", parts.map(p => (p.toolInvocation ? `${p.toolInvocation.toolName}:${p.toolInvocation.state}` : p.type)));
