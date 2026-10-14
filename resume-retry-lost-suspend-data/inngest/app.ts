import { appendFileSync } from "node:fs";
import { Mastra } from "@mastra/core";
import { InMemoryStore, MastraCompositeStore } from "@mastra/core/storage";
import { createStep } from "@mastra/core/workflows";
import { init } from "@mastra/inngest";
import { Inngest } from "inngest";
import { z } from "zod";
import { FileWorkflows } from "./store.ts";

const url = process.env.INNGEST_URL!;
process.env.INNGEST_DEV = url;
process.env.INNGEST_BASE_URL = url;
export const inngest = new Inngest({ id: "repro", baseUrl: url, isDev: true });

// Suspends with { question }. When resumed it works for WORK_MS and returns the answer.
// Every call is appended to calls.log.
const ask = createStep({
  id: "ask",
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ answer: z.string() }),
  suspendSchema: z.object({ question: z.string() }),
  resumeSchema: z.object({ answer: z.string() }),
  execute: async ({ resumeData, suspendData, suspend }) => {
    appendFileSync("calls.log", `pid ${process.pid}  resumeData ${JSON.stringify(resumeData)}  suspendData ${JSON.stringify(suspendData)}\n`);
    if (resumeData === undefined) return await suspend({ question: "which one?" });
    await new Promise(resolve => setTimeout(resolve, Number(process.env.WORK_MS ?? 1000)));
    return { answer: resumeData.answer };
  },
});

export const workflow = init(inngest)
  .createWorkflow({
    id: "repro",
    inputSchema: z.object({ topic: z.string() }),
    outputSchema: z.object({ answer: z.string() }),
    retries: 3, // Inngest function retries
  })
  .then(ask)
  .commit();

export const mastra = new Mastra({
  workflows: { repro: workflow },
  storage: new MastraCompositeStore({ id: "repro", default: new InMemoryStore(), domains: { workflows: new FileWorkflows("runs.json") } }),
  logger: false,
});
