import { connect } from "@mastra/inngest/connect";
import { inngest, mastra } from "./app.ts";

await connect({ mastra, inngest });
console.log(`worker ${process.pid} connected`);
await new Promise(() => {}); // runs until killed
