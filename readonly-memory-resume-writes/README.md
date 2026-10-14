# resumeGenerate() and resumeStream() save the run's messages to the thread when memory.options.readOnly is true

**Versions:** `@mastra/core` 1.76.0 and 1.77.0 (both reproduce), `@mastra/memory` 1.37.0 and 1.37.1, `zod` 4.4.3, `tsx` 4.21.0, Node 25.9.0, `InMemoryStore`.

## Expected vs actual

- Expected: no new rows in the thread on any leg of the run, as for `generate()` and for a run that never suspends.
- Actual: 2 rows after `resumeGenerate()`, holding the tool traffic of the whole run.

## Steps to reproduce

1. `generate()` with `memory: { thread, resource, options: { readOnly: true } }` and a tool that calls `suspend()`: the thread stays empty.
2. `resumeGenerate()` with the same memory option: two rows appear in the thread, already before the resumed tool returns.
3. Control: the same agent on a run that never suspends leaves its thread empty.

Mock model, in-memory storage, no network:

```sh
pnpm install && sh run.sh
```

For 1.77.0 use `@mastra/core` 1.77.0 and `@mastra/memory` 1.37.1.

## Output

`@mastra/core` 1.76.0:

```text
control, run without suspension:    []
t1 before the run:                  []
t1 after generate (suspended):      []
inside ask, on resume, rows already: [ 'user:80410143', 'assistant:0e186770' ]
t1 after resumeGenerate (done):     [ 'user:80410143', 'assistant:0e186770' ]
parts of the assistant row:         [ 'lookup:result', 'step-start', 'ask:call' ]
```

`@mastra/core` 1.77.0:

```text
control, run without suspension:    []
t1 before the run:                  []
t1 after generate (suspended):      []
inside ask, on resume, rows already: [ 'user:fa6f1b05', 'assistant:65353f71' ]
t1 after resumeGenerate (done):     [ 'user:fa6f1b05', 'assistant:65353f71' ]
parts of the assistant row:         [ 'lookup:result', 'step-start', 'ask:call' ]
```

The control run and the suspending `generate()` leave their threads empty. The two rows are already in `t1` inside the resumed tool, before it returns.
