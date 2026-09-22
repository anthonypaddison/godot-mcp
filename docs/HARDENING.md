# Security hardening

This derivative retains the hardened design based on commit
`fcbc29e03297900b9a1fcc6c7cbae116fe9d532a`.

- The server requires configured allowed roots. Exposed project-scoped
  filesystem handlers validate canonical roots and child paths, including
  traversal and symlink escapes. This is not an operating-system sandbox and
  does not constrain Godot runtime capabilities, project code, or host process
  permissions; validation/use races remain possible.
- Dangerous generic capabilities were removed or constrained.
- Runtime IPC is authenticated on loopback using an ephemeral port and
  session-scoped token.
- Lifecycle recovery uses manifests and checks for concurrent edits before
  restoring temporary project state; this is not a guarantee against every
  concurrent modification.
- Export verification excludes the temporary MCP runtime.
- Security regression tests cover containment, recovery, and stale-token
  isolation.

Hosts should still require explicit user approval and use tool allowlists.
The server operates with the permissions of its host process; exposed project
operations can modify project data, and a permitted Godot project can perform
powerful game-engine operations. Do not treat this derivative as a sandbox for
untrusted projects or inputs.
