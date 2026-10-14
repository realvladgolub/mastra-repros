// Default engine, no Inngest. Two invocations:
//   tsx repro.ts first    start, suspend, resume; the process kills itself with SIGKILL while the resumed step works
//   tsx repro.ts second   Run.restart() in a new process
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { Mastra } from "@mastra/core";
import { InMemoryDB, InMemoryStore, MastraCompositeStore, WorkflowsInMemory } from "@mastra/core/storage";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

// In-memory workflows store mirrored to one JSON file, so that the run survives the SIGKILL.
class FileWorkflows extends WorkflowsInMemory {
  constructor(file: string) {
    super({ db: new InMemoryDB() });
    for (const name of ["persistWorkflowSnapshot", "updateWorkflowResults", "updateWorkflowState", "loadWorkflowSnapshot", "getWorkflowRunById"]) {
      const original = (this as any)[name].bind(this);
      (this as any)[name] = async (...args: unknown[]) => {
        try {
          this.db.workflows.clear();
          for (const [key, row] of Object.entries(JSON.parse(readFileSync(file, "utf8")))) this.db.workflows.set(key, row as any);
        } catch {} // no file yet
        const result = original(...args); // runs synchronously: the map is final when it returns
        writeFileSync(`${file}.tmp`, JSON.stringify(Object.fromEntries(this.db.workflows)));
        renameSync(`${file}.tmp`, file);
        return await result;
      };
    }
  }
}

const role = process.argv[2]; // "first" or "second"

const ask = createStep({
  id: "ask",
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ answer: z.string() }),
  suspendSchema: z.object({ question: z.string() }),
  resumeSchema: z.object({ answer: z.string() }),
  execute: async ({ resumeData, suspendData, suspend }) => {
    console.log(`${role}: execute()  resumeData ${JSON.stringify(resumeData)}  suspendData ${JSON.stringify(suspendData)}`);
    if (resumeData === undefined) return await suspend({ question: "which one?" });
    await new Promise(resolve => setTimeout(resolve, role === "first" ? 60_000 : 500)); // the work
    return { answer: resumeData.answer };
  },
});

const workflow = createWorkflow({
  id: "repro",
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ answer: z.string() }),
})
  .then(ask)
  .commit();

const mastra = new Mastra({
  workflows: { repro: workflow },
  storage: new MastraCompositeStore({ id: "repro", default: new InMemoryStore(), domains: { workflows: new FileWorkflows("runs.json") } }),
  logger: false,
});

const run = await workflow.createRun({ runId: "run-1" });
if (role === "first") {
  console.log("first: start() ->", (await run.start({ inputData: { topic: "colors" } })).status);
  setTimeout(() => process.kill(process.pid, "SIGKILL"), 2000); // crash while the resumed step works
  await run.resume({ step: "ask", resumeData: { answer: "blue" } });
} else {
  const store = await mastra.getStorage()!.getStore("workflows");
  const entry = (await store!.loadWorkflowSnapshot({ workflowName: "repro", runId: "run-1" }))!.context.ask as any;
  console.log(`second: stored step entry before restart: status ${entry.status}, keys ${Object.keys(entry).sort().join(" ")}`);
  const result = await run.restart();
  console.log("second: restart() ->", result.status);
}
