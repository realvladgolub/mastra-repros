// The same agent and step as common.ts, in an Inngest workflow (@mastra/inngest init()).
import { Mastra } from "@mastra/core";
import { init } from "@mastra/inngest";
import { Inngest } from "inngest";
import { z } from "zod";
import { agent, storage, turn, WORKFLOW_ID } from "./common.ts";

export const URL_ = process.env.INNGEST_URL ?? "http://127.0.0.1:12488";
export function makeInngest() {
  process.env.INNGEST_DEV = URL_;
  process.env.INNGEST_BASE_URL = URL_;
  for (const key of ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY", "INNGEST_SIGNING_KEY_FALLBACK", "INNGEST_API_BASE_URL"]) delete process.env[key];
  return new Inngest({ id: WORKFLOW_ID, baseUrl: URL_, isDev: true });
}
export function makeMastra(inngest: Inngest) {
  const workflow = init(inngest)
    .createWorkflow({
      id: WORKFLOW_ID,
      inputSchema: z.object({ topic: z.string() }),
      outputSchema: z.object({ text: z.string() }),
      ...({ retries: Number(process.env.RETRIES ?? 2) } as object),
    })
    .then(turn)
    .commit();
  const mastra = new Mastra({ agents: { asker: agent }, workflows: { [WORKFLOW_ID]: workflow }, storage: storage(), logger: false });
  return { mastra, workflow };
}
