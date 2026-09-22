# MCP v2 compatibility boundary

Godot MCP 1.0 uses `@modelcontextprotocol/sdk` 1.30.0 and the legacy MCP
stdio profile. SDK v2 and newer protocol revisions are outside this release's
compatibility claims. This note is a technical boundary, not a roadmap or
migration-date commitment.

Any future version that claims a newer profile would need its own
implementation and interoperability evidence, including checks for:

- protocol negotiation and discovery;
- per-request metadata handling;
- stdio and lifecycle behavior;
- tool and result schema compatibility;
- cancellation and graceful shutdown;
- compatibility with supported MCP clients.

Do not infer compatibility with another protocol generation from the current
legacy stdio integration.
