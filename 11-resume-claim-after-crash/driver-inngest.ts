// Starts worker w1, starts the run, lets it suspend, resumes it, SIGKILLs w1 while the resumed agent loop is
// calling the model (after the resume claim), starts worker w2 and waits for Inngest to run the step again.
import { spawn } from "node:child_process";
import { openSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loopRow, OBS, OUT, sleep, WORKFLOW_ID } from "./common.ts";
import { makeInngest, makeMastra, URL_ } from "./inngest-common.ts";

const t0 = Date.now();
const say = (message: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s  ${message}`);
const seen = (): any[] => {
  try {
    return readFileSync(OBS, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
  } catch {
    return [];
  }
};
async function until<T>(read: () => T | Promise<T>, ms: number): Promise<T | undefined> {
  for (const start = Date.now(); Date.now() - start < ms; await sleep(250)) {
    const value = await read();
    if (value) return value;
  }
}
const gql = (query: string): Promise<any> =>
  fetch(`${URL_}/v0/gql`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) }).then(r => r.json());
const workers: ReturnType<typeof spawn>[] = [];
process.on("exit", () => workers.forEach(child => { try { process.kill(child.pid!, "SIGKILL"); } catch {} }));
async function startWorker(role: string) {
  const log = openSync(join(OUT, `${role}.log`), "a");
  const child = spawn(process.execPath, ["--import", "tsx", "worker.ts"], { cwd: import.meta.dirname, env: { ...process.env, ROLE: role, HANG_ROLE: "w1" }, stdio: ["ignore", log, log] });
  workers.push(child);
  if (!(await until(() => seen().some(o => o.ev === "worker.connected" && o.pid === child.pid), 60_000))) throw new Error(`${role} did not connect`);
  await until(async () => (await gql("{ apps { name connected } }")).data?.apps?.some((a: any) => a.name === WORKFLOW_ID && a.connected), 30_000);
  say(`${role} (pid ${child.pid}) connected to Inngest`);
  return child;
}

const { mastra, workflow } = makeMastra(makeInngest());
const snap = async (runId: string): Promise<any> => (await mastra.getStorage()!.getStore("workflows"))!.loadWorkflowSnapshot({ workflowName: WORKFLOW_ID, runId });
const w1 = await startWorker("w1");
const runId = `run-${Date.now()}`;
await (await workflow.createRun({ runId })).startAsync({ inputData: { topic: "colors" } });
if (!(await until(async () => (await snap(runId))?.status === "suspended", 60_000))) throw new Error("the run did not suspend");
const agentRunId = seen().find(o => o.ev === "step.firstLeg")?.agentRunId;
say(`workflow run suspended; agent loop row: ${JSON.stringify(await loopRow(mastra, agentRunId))}`);
await (await mastra.getWorkflow(WORKFLOW_ID).createRun({ runId })).resumeAsync({ step: "turn", resumeData: { text: "blue" } });
await until(() => seen().some(o => o.ev === "model.hangs"), 60_000);
say(`resumed leg is calling the model in w1; agent loop row: ${JSON.stringify(await loopRow(mastra, agentRunId))}`);
const exited = new Promise(resolve => w1.once("exit", resolve));
process.kill(w1.pid!, "SIGKILL");
await exited;
const killedAt = Date.now();
say(`SIGKILL w1; agent loop row: ${JSON.stringify(await loopRow(mastra, agentRunId))}`);
await startWorker("w2");
say("waiting for Inngest to run the step again in w2");
const deadline = Date.now() + Number(process.env.MAX_WAIT_S ?? 900) * 1000;
let reported = 0;
while (Date.now() < deadline) {
  const tries = seen().filter(o => o.role === "w2" && o.ev.startsWith("step.resumeGenerate"));
  for (const t of tries.slice(reported)) say(`w2: step run again, ${t.ev === "step.resumeGenerate.ok" ? `resumeGenerate() ok "${t.text}"` : `resumeGenerate() threw ${t.id}`}, ${((Date.parse(t.at) - killedAt) / 1000).toFixed(0)} s after the kill`);
  reported = tries.length;
  const status = (await snap(runId))?.status;
  if (["success", "failed", "canceled"].includes(status)) break;
  await sleep(1000);
}
await sleep(2000);
const again = seen().filter(o => o.role === "w2" && o.ev === "step.resumedLeg").at(-1);
say(`suspendData of the step run again: ${JSON.stringify(again?.suspendData)}`);
say(`workflow run status: ${(await snap(runId))?.status}; agent loop row: ${JSON.stringify(await loopRow(mastra, agentRunId))}`);
process.exit(0);
