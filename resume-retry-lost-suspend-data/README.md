# Step resumed with resumeData and run again after a crash gets suspendData undefined: the stored suspend payload is overwritten when the resumed step starts

**Versions:** `@mastra/core` 1.76.0 and 1.77.0 (reproduces on both), `zod` 4.4.3, Node 25.9.0. For the Inngest variant also `@mastra/inngest` 1.10.4 and 1.10.5, `inngest` 4.18.1. Storage is a small JSON-file store built on the public `WorkflowsInMemory`, so the run survives a SIGKILL; I did not run this on `@mastra/pg` or `@mastra/libsql`.

## Expected vs actual

- Expected: the run executed again after a crash gets the same inputs as the lost execution, `resumeData` and `suspendData`. The docs describe `suspendData` as the data passed to `suspend()`, and a restart as continuing from the last active step.
- Actual: `resumeData` is there (restored from the stored `resumePayload`), `suspendData` is `undefined`. The stored step entry before the restart has the keys `payload resumePayload resumedAt startedAt status`, no `suspendPayload`.

## Steps to reproduce

Default engine (folder `default-engine`, one file):

Default engine, no Inngest, one file. `repro.ts` starts the run, lets it suspend, resumes it, and kills its own process with SIGKILL while the resumed step works. A second process calls `Run.restart()`. Run it with `pnpm install && sh run.sh`.

```sh
cd default-engine
pnpm install && sh run.sh
```

For 1.77.0 set `@mastra/core` to `1.77.0` in package.json.

Inngest variant (folder `inngest`):

A worker connected with `@mastra/inngest/connect` runs the same one-step workflow (function `retries: 3`). The driver starts a worker, starts the run, waits for `suspended`, calls `resumeAsync()`, kills the worker with SIGKILL while the resumed step works, starts a second worker and waits. Inngest then delivers the request of the resume event again, to the second worker, and the step gets `resumeData` but not `suspendData`. It needs a private Inngest dev server (`inngest-cli` 1.46.0, started by `run.sh`). Run it with `pnpm install && PORT=12200 sh run.sh`.

For 1.77.0 use `@mastra/core` `1.77.0` and `@mastra/inngest` `1.10.5`.

## Output

`sh run.sh` with `@mastra/core` 1.76.0:

```text
first: execute()  resumeData undefined  suspendData undefined
first: start() -> suspended
first: execute()  resumeData {"answer":"blue"}  suspendData {"question":"which one?"}
second: stored step entry before restart: status running, keys payload resumePayload resumedAt startedAt status
second: execute()  resumeData {"answer":"blue"}  suspendData undefined
second: restart() -> success
```

`sh run.sh` with `@mastra/core` 1.77.0:

```text
first: execute()  resumeData undefined  suspendData undefined
first: start() -> suspended
first: execute()  resumeData {"answer":"blue"}  suspendData {"question":"which one?"}
second: stored step entry before restart: status running, keys payload resumePayload resumedAt startedAt status
second: execute()  resumeData {"answer":"blue"}  suspendData undefined
second: restart() -> success
```

<details>
<summary>Inngest variant output</summary>

`PORT=12200 sh run.sh` with `@mastra/core` 1.76.0 and `@mastra/inngest` 1.10.4:

```text
   0.0 s  started w1 (pid 45594)
   1.4 s  run suspended, step entry keys: startedAt status suspendPayload suspendedAt
   3.3 s  resumed step is working, step entry keys: resumePayload resumedAt startedAt status
   3.4 s  w1 killed with SIGKILL
   6.4 s  started w2 (pid 45717)
   6.4 s  w2 connected, waiting for Inngest to deliver the request again
 169.3 s  run status success

calls of the step's execute():
pid 45594  resumeData undefined  suspendData undefined
pid 45594  resumeData {"answer":"blue"}  suspendData {"question":"which one?"}
pid 45717  resumeData {"answer":"blue"}  suspendData undefined
```

`PORT=12210 sh run.sh` with `@mastra/core` 1.77.0 and `@mastra/inngest` 1.10.5:

```text
   0.0 s  started w1 (pid 46867)
   1.4 s  run suspended, step entry keys: startedAt status suspendPayload suspendedAt
   3.1 s  resumed step is working, step entry keys: resumePayload resumedAt startedAt status
   3.2 s  w1 killed with SIGKILL
   6.2 s  started w2 (pid 47000)
   6.2 s  w2 connected, waiting for Inngest to deliver the request again
 160.4 s  run status success

calls of the step's execute():
pid 46867  resumeData undefined  suspendData undefined
pid 46867  resumeData {"answer":"blue"}  suspendData {"question":"which one?"}
pid 47000  resumeData {"answer":"blue"}  suspendData undefined
```

</details>
