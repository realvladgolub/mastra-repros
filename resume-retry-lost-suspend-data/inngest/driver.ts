// Starts a worker, runs the workflow until it suspends, resumes it, kills the worker with SIGKILL while the
// resumed step works, starts a second worker and waits for Inngest to deliver the request again.
import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { mastra, workflow } from "./app.ts";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const t0 = Date.now();
const say = (text: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s  ${text}`);
const calls = () => { try { return readFileSync("calls.log", "utf8"); } catch { return ""; } };
const snapshot = async (runId: string): Promise<any> => (await (await mastra.getStorage()!.getStore("workflows"))!).loadWorkflowSnapshot({ workflowName: "repro", runId });
async function until(check: () => unknown | Promise<unknown>, seconds: number) {
  for (const start = Date.now(); Date.now() - start < seconds * 1000; await sleep(200)) if (await check()) return true;
  throw new Error("timeout");
}
function startWorker(name: string, workMs: number) {
  const child = spawn(process.execPath, ["--import", "tsx", "worker.ts"], { env: { ...process.env, WORK_MS: String(workMs) }, stdio: "ignore" });
  say(`started ${name} (pid ${child.pid})`);
  return child;
}
const connected = () => fetch(`${process.env.INNGEST_URL}/v0/gql`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "{ apps { name connected } }" }) })
  .then(r => r.json()).then((r: any) => r.data.apps.some((a: any) => a.name === "repro" && a.connected));

rmSync("calls.log", { force: true });
rmSync("runs.json", { force: true });
const w1 = startWorker("w1", 600_000);
await until(connected, 60);
const runId = `run-${Date.now()}`;
await (await workflow.createRun({ runId })).startAsync({ inputData: { topic: "colors" } });
await until(async () => (await snapshot(runId))?.status === "suspended", 30);
say(`run suspended, step entry keys: ${Object.keys((await snapshot(runId)).context.ask).sort().join(" ")}`);
await (await mastra.getWorkflow("repro").createRun({ runId })).resumeAsync({ step: "ask", resumeData: { answer: "blue" } });
await until(() => calls().includes('resumeData {"answer":"blue"}'), 60);
await sleep(1500);
say(`resumed step is working, step entry keys: ${Object.keys((await snapshot(runId)).context.ask).sort().join(" ")}`);
const exited = new Promise(resolve => w1.once("exit", resolve));
process.kill(w1.pid!, "SIGKILL");
await exited;
say("w1 killed with SIGKILL");
await sleep(3000);
const w2 = startWorker("w2", 1000);
await until(connected, 60);
say("w2 connected, waiting for Inngest to deliver the request again");
await until(async () => ["success", "failed"].includes((await snapshot(runId))?.status), 420);
await sleep(1000);
say(`run status ${(await snapshot(runId)).status}`);
console.log(`\ncalls of the step's execute():\n${calls()}`);
w2.kill("SIGKILL");
process.exit(0);
