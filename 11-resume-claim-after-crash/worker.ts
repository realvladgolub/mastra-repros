// The process that runs the step and is killed. Start it with `node --import tsx worker.ts`.
import { connect } from "@mastra/inngest/connect";
import { obs } from "./common.ts";
import { makeInngest, makeMastra } from "./inngest-common.ts";

const inngest = makeInngest();
const { mastra } = makeMastra(inngest);
await connect({ mastra, inngest });
obs({ ev: "worker.connected" });
