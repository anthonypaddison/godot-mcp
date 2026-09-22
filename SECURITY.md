# Security policy

Godot MCP can modify Godot projects and control a running local game. Treat
every tool invocation as privileged and require host-side user approval.

`GODOT_MCP_ALLOWED_DIRS` is required at startup. Exposed project-scoped
filesystem handlers validate canonical roots and filesystem child paths against
that boundary, including traversal and symlink escapes. This setting is not an
operating-system sandbox: runtime Godot capabilities, project code, races
between validation and use, and host process permissions remain relevant. Run
the server only with trusted projects and restrict the host process's
filesystem permissions.
Runtime control uses loopback IPC, an ephemeral port, and a session token.
Recovery checks for detected concurrent edits when restoring temporary
project state, but cannot guarantee preservation under every possible race.

The server filters arbitrary GDScript evaluation, generic method invocation,
and its generic HTTP, WebSocket, multiplayer, and RPC tools. Other exposed tools
can read or modify project data and control the running game. Require host-side
approval and use a narrow tool allowlist.

Operators should use least-privilege roots and MCP client tool allowlists. Do
not place credentials, tokens, cookies, or private project data in issues or
logs.

Do not put suspected vulnerability details in public issues. Use GitHub
private vulnerability reporting if it is enabled for this repository; if no
private reporting channel is available, contact the repository owner privately
before sharing exploit details.
