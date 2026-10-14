// Workflow storage that survives a SIGKILL: the in-memory workflows store, mirrored to one JSON file.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { InMemoryDB, WorkflowsInMemory } from "@mastra/core/storage";

const METHODS = [
  "persistWorkflowSnapshot",
  "updateWorkflowResults",
  "updateWorkflowState",
  "loadWorkflowSnapshot",
  "listWorkflowRuns",
  "getWorkflowRunById",
  "deleteWorkflowRunById",
];

export class FileWorkflows extends WorkflowsInMemory {
  constructor(file: string) {
    super({ db: new InMemoryDB() });
    for (const name of METHODS) {
      const original = (this as any)[name].bind(this);
      (this as any)[name] = async (...args: unknown[]) => {
        try {
          this.db.workflows.clear();
          for (const [key, row] of Object.entries(JSON.parse(readFileSync(file, "utf8")))) this.db.workflows.set(key, row as any);
        } catch {} // no file yet
        const result = original(...args); // runs synchronously: the map is final when it returns
        writeFileSync(`${file}.${process.pid}`, JSON.stringify(Object.fromEntries(this.db.workflows)));
        renameSync(`${file}.${process.pid}`, file);
        return await result;
      };
    }
  }
}
