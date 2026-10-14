# Agent.resumeGenerate() with data that fails the tool's resumeSchema consumes the suspended run instead of rejecting the call

**Versions:** @mastra/core 1.76.0 and 1.77.0 (both reproduce), zod 4.4.3, tsx 4.21.0, Node 25.9.0. In-memory storage (`InMemoryStore`) and the mock model `MastraLanguageModelV2Mock`, no network.

## Expected vs actual

- Expected: resume data that fails the tool's `resumeSchema` is refused at the `resumeGenerate()` call (a thrown validation error, like `run.resume()` on a workflow step) and the run stays suspended, so the caller can resume again with valid data.
- Actual: the validation error is passed to the model as a tool result, the run ends, the suspension is deleted, and the retry fails with `AGENT_RESUME_NO_SNAPSHOT_FOUND`.

## Steps to reproduce

1. `generate()` with a tool that has a `resumeSchema` and calls `agent.suspend()`: the run suspends.
2. `resumeGenerate({ nope: 1 })`, data that does not match the schema.
3. `resumeGenerate()` again with valid data.
4. For contrast, the same `resumeSchema` on a workflow step and `run.resume()` with the same wrong data, then valid data.

Mock model, in-memory storage, no network:

```sh
pnpm install && sh run.sh
```

For 1.77.0 only `@mastra/core` changes to `1.77.0`.

## Output

@mastra/core 1.76.0 (`./node_modules/.bin/tsx repro.ts`):

```text
generate -> suspended | suspended runs: 1
resumeGenerate({ nope: 1 }) -> stop, text "done" (no throw, not suspended)
tool result the model read: [{"type":"json","value":{"error":true,"message":"Tool input validation failed for ask. Please fix the following errors and try again:\n- text: Invalid input: expected string, received undefined\n\nProvided arguments: {\n  \"nope\": 1\n}","validationErrors":{"errors":[],"fields":{"text":{"errors":["Invalid input: expected string, received undefined"],"fields":{}}}}}}]
suspended runs: 0
retry with valid data throws: AGENT_RESUME_NO_SNAPSHOT_FOUND
workflow, wrong data throws: Invalid resume data:  - text: Invalid input: expected string, received undefined
workflow, then valid data: success
```

@mastra/core 1.77.0 (same script, same command):

```text
generate -> suspended | suspended runs: 1
resumeGenerate({ nope: 1 }) -> stop, text "done" (no throw, not suspended)
tool result the model read: [{"type":"json","value":{"error":true,"message":"Tool input validation failed for ask. Please fix the following errors and try again:\n- text: Invalid input: expected string, received undefined\n\nProvided arguments: {\n  \"nope\": 1\n}","validationErrors":{"errors":[],"fields":{"text":{"errors":["Invalid input: expected string, received undefined"],"fields":{}}}}}}]
suspended runs: 0
retry with valid data throws: AGENT_RESUME_NO_SNAPSHOT_FOUND
workflow, wrong data throws: Invalid resume data:  - text: Invalid input: expected string, received undefined
workflow, then valid data: success
```

The last two lines are the contrast: the same schema on a workflow step is refused and the run stays suspended.
