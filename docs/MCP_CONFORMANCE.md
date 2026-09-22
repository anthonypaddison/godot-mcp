# MCP compatibility

Godot MCP 1.0 claims compatibility with the legacy MCP generation provided by
the v1 TypeScript SDK. It does not claim MCP 2026-07-28 or SDK v2 conformance.

| Legacy requirement | Status | Evidence |
|---|---|---|
| `initialize` / `initialized` flow | PASS | SDK `Server` and stdio transport |
| JSON-RPC over stdio | PASS | `StdioServerTransport` |
| Server capability advertisement | PASS | Tools capability is advertised |
| `tools/list` | PASS | Deterministic inline tool list with hardened filtering |
| `tools/call` | PASS | Explicit dispatch and tool error responses |
| Object input schemas | PASS | All exposed tools define object schemas; tests check required fields |
| Deterministic tool ordering | PASS | Tool definitions are returned in source order |
| Process diagnostics | PASS | Server diagnostics use stderr; stdout is reserved for transport |
| Graceful termination | PASS | SIGINT/SIGTERM cleanup handlers |
| Cancellation and progress | PARTIAL | Legacy SDK behavior is retained; no new v2 lifecycle is claimed |
| Modern `server/discover` | N/A | Deferred to the v2 project |
| Modern per-request `_meta` | N/A | Deferred to the v2 project |

Modern features are intentionally absent and are not release blockers for this
legacy-profile release. See [MCP_V2_MIGRATION.md](MCP_V2_MIGRATION.md).
