# Contributing

Contributions to this unofficial hardened derivative are welcome. Please keep
changes focused and describe their effect on Godot project files, runtime
behavior, filesystem boundaries, and MCP compatibility.

## Development setup

1. Clone this repository and install the locked dependencies with `npm ci`.
2. Build with `npm run build`.
3. Run the relevant tests; the established checks are listed below.

```bash
npm run build
npm test
npm run test:stdio
npm run test:stale-token
```

Use a disposable Godot project for tests that launch or modify a project. Do
not test against a personal or production project unless the test specifically
requires it and its side effects are understood.

## Changes to tools or security boundaries

Keep tool discovery and dispatch aligned, validate arguments, and add tests for
the behavior and side effects. Update the README capability summary when the
exposed tool set changes. Changes to filesystem containment, process execution,
runtime IPC, session credentials, or disabled capabilities need explicit
security review. Do not casually reintroduce arbitrary code evaluation,
generic method invocation, generic network tools, or unauthenticated runtime
control.

Configured roots constrain supported project-path operations, but are not an
operating-system sandbox. Do not describe or test them as one.

## Pull requests

Describe the user-visible change, security and compatibility impact, and the
tests run. Include a minimal reproduction for bug fixes and note any checks
that could not be performed.

## Compatibility

The current release line uses the legacy stdio profile from MCP SDK v1. See
[`docs/MCP_CONFORMANCE.md`](docs/MCP_CONFORMANCE.md) and
[`docs/MCP_V2_MIGRATION.md`](docs/MCP_V2_MIGRATION.md). Do not claim SDK v2 or
modern MCP revision compatibility without implementing and verifying it.
