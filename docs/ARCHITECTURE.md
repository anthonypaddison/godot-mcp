# Architecture

```text
MCP client
  -> stdio MCP server
  -> handler-specific project path checks and tool dispatch
  -> authenticated local runtime IPC
  -> temporary Godot helper
  -> running Godot project
```

The server owns the MCP process and one active Godot runtime session. It
requires configured allowed roots and validates project roots plus supported
path-taking operations, including secondary filesystem paths, against their
canonical project locations. Rejected paths are blocked before the associated
filesystem operation or Godot dispatch. This is not an operating-system
sandbox: Godot runtime capabilities, project code, validation/use races, and
host process permissions remain outside the guarantee. Run only trusted
projects and do not rely on configured roots alone to isolate untrusted code.
The temporary helper uses authenticated loopback IPC with an ephemeral port
and session-scoped token. Recovery and cleanup attempt to restore temporary
integration state while preserving detected concurrent edits. Multi-project
runtime concurrency is intentionally unsupported.
