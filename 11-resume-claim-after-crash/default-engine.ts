// Default engine, no Inngest. Three invocations, each a new process on the same Postgres database:
//   tsx default-engine.ts first    start, suspend, resume; SIGKILL of its own process while the resumed loop runs
//   tsx default-engine.ts second   Run.restart() of the workflow run (what recovery does for an active run)
//   tsx default-engine.ts third    65 s later, resumeGenerate() of the agent run directly (the claim never goes stale)
import { Mastra } from "@mastra/core";
import { agent, defaultWorkflow, loopRow, obs, OBS, sleep, storage } from "./common.ts";
import { readFileSync } from "node:fs";

const role = process.env.ROLE!;
const mastra = new Mastra({ agents: { asker: agent }, workflows: { issue11: defaultWorkflow() }, storage: storage(), logger: false });
const say = (message: string) => console.log(`${role}: ${message}`);
const seen = () => readFileSync(OBS, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
const agentRunId = () => seen().find(o => o.ev === "step.firstLeg")?.agentRunId as string;

if (role === "first") {
  const run = await mastra.getWorkflow("issue11").createRun({ runId: "run-1" });
  say(`start() -> ${(await run.start({ inputData: { topic: "colors" } })).status}`);
  say(`agent loop row after the suspension: ${JSON.stringify(await loopRow(mastra, agentRunId()))}`);
  void run.resume({ step: "turn", resumeData: { text: "blue" } });
  while (!seen().some(o => o.ev === "model.hangs")) await sleep(50);
  say(`the resumed loop is calling the model; agent loop row now: ${JSON.stringify(await loopRow(mastra, agentRunId()))}`);
  say("SIGKILL");
  process.kill(process.pid, "SIGKILL");
} else if (role === "second") {
  say(`agent loop row after the crash: ${JSON.stringify(await loopRow(mastra, agentRunId()))}`);
  const run = await mastra.getWorkflow("issue11").createRun({ runId: "run-1" });
  const result: any = await run.restart();
  say(`restart() -> ${result.status}`);
  const error = seen().filter(o => o.ev === "step.resumeGenerate.error").at(-1);
  if (error) say(`resumeGenerate() in the step run again threw ${error.id}: ${error.message}`);
  say(`suspendData of the step run again: ${JSON.stringify(seen().filter(o => o.ev === "step.resumedLeg").at(-1)?.suspendData)}`);
  process.exit(0);
} else {
  say("waiting 65 s (AGENT_RESUME_CLAIM_STALE_MS is 60 s)");
  await sleep(65_000);
  say(`agent loop row: ${JSON.stringify(await loopRow(mastra, agentRunId()))}`);
  await mastra
    .getAgent("asker")
    .resumeGenerate({ text: "blue" }, { runId: agentRunId(), toolCallId: "call-1", maxSteps: 5 })
    .then(out => say(`resumeGenerate() -> ${out.finishReason} "${out.text}"`), (error: any) => say(`resumeGenerate() threw ${error.id}`));
  process.exit(0);
}
