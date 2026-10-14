# Mastra reproductions

Minimal reproductions for issues reported to mastra-ai/mastra. Each folder is self-contained: `pnpm install && sh run.sh`.

- [resume-retry-lost-suspend-data](resume-retry-lost-suspend-data): Step resumed with resumeData and run again after a crash gets suspendData undefined: the stored suspend payload is overwritten when the resumed step starts
- [resume-invalid-data-consumes-run](resume-invalid-data-consumes-run): Agent.resumeGenerate() with data that fails the tool's resumeSchema consumes the suspended run instead of rejecting the call
- [readonly-memory-resume-writes](readonly-memory-resume-writes): resumeGenerate() and resumeStream() save the run's messages to the thread when memory.options.readOnly is true
