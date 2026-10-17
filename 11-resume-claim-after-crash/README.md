# Plain Agent: a resume whose process died keeps its claim for ever (Mastra 1.78.0)

Since `@mastra/core` 1.77.0 (#26688), `Agent.resumeGenerate()` claims the suspended `agentic-loop` row: `suspended -> pending -> running`.
If the process dies after the claim reaches `running`, nothing gives the run back, so every later resume
(the workflow step run again by `Run.restart()` or by Inngest's retry) fails with `AGENT_RESUME_ALREADY_CLAIMED`.

Needs Node 22+, an EMPTY Postgres database (`DATABASE_URL`), and for the Inngest variant the inngest CLI.

```sh
npm install
DATABASE_URL=postgres://localhost:5432/repro_default sh run-default.sh   # about 70 s
DATABASE_URL=postgres://localhost:5432/repro_inngest sh run-inngest.sh   # about 3 minutes
```

`observed/` holds the output of both scripts on 1.78.0 (17.10.2026, macOS, Node 25.9.0, Postgres 14, inngest-cli 1.46).
No real model is called (`MastraLanguageModelV2Mock`). Inngest dev is started on 127.0.0.1 with `DO_NOT_TRACK=1`.
