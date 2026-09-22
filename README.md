# Godot MCP

An unofficial hardened community derivative of [godot-mcp](https://github.com/tugcantopaloglu/godot-mcp), which builds on the original [Coding-Solo/godot-mcp](https://github.com/Coding-Solo/godot-mcp). This project is not affiliated with the Godot Foundation or either upstream maintainer. Their projects and maintainers are not responsible for this derivative.

This repository is source-distributed. It is not an npm installation guide or a claim that a package is currently published. The package metadata remains marked private.

## Compatibility and requirements

- Node.js 18 or later; CI uses Node.js 22.
- Godot 4.4 or later. Godot 4.7.1 was used for local release validation.
- An MCP client that supports a local stdio server.
- The .NET SDK and Godot .NET build are needed only for C# project/script operations.

This release uses `@modelcontextprotocol/sdk` 1.x and the legacy MCP stdio profile. It does not claim SDK v2 or MCP `2026-07-28` conformance. See [MCP compatibility](docs/MCP_CONFORMANCE.md) and [v2 migration notes](docs/MCP_V2_MIGRATION.md); those notes do not promise a migration date.

## Capabilities

The server exposes Godot project inspection and execution, selected project and resource editing, GDScript validation, project creation and configuration, and running-game inspection and input tools. The client may further restrict the discovered tools with its own allowlist.

Exposed tools cover Godot project inspection and execution; scene, resource, script, and project-file operations; GDScript validation; project creation and selected project configuration; and running-game inspection, input, and specific node, scene, animation, audio, physics, rendering, and UI operations. Some of these tools modify or remove project content or change the running game. Review the operation and target before approving it.

The hardened server does **not** expose arbitrary `game_eval`, generic method invocation, generic networking, or a general-purpose filesystem browser. In particular, `game_eval`, `game_call_method`, `game_http_request`, `game_websocket`, `game_multiplayer`, `game_rpc`, and several project administration tools are intentionally filtered from `tools/list`; see `REMOVED_TOOLS` in [`src/index.ts`](src/index.ts). Exposed project-scoped filesystem handlers validate canonical roots and filesystem child paths against `GODOT_MCP_ALLOWED_DIRS`. This is not an operating-system sandbox and does not prevent Godot runtime capabilities, project code, validation/use races, or host process permissions from affecting other data; permitted operations are not read-only.

## Installation from source

Clone this repository, then install from its lockfile and build:

```bash
git clone https://github.com/anthonypaddison/godot-mcp.git
cd godot-mcp
npm ci
npm run build
```

No published npm package is assumed by these instructions. Run the resulting stdio server from an MCP client using the absolute path to `build/index.js`.

## Configuration

Set `GODOT_MCP_ALLOWED_DIRS` to one or more existing project roots. It is required; the server refuses to start if it is unset or resolves to no existing directories. On macOS/Linux, separate roots with `:` or `,`. On Windows, use `;` or `,`.

Example MCP client configuration (JSON shape; adapt the enclosing key to your client):

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["/absolute/path/to/godot-mcp/build/index.js"],
      "env": {
        "GODOT_MCP_ALLOWED_DIRS": "/absolute/path/to/your/godot-projects",
        "GODOT_PATH": "/absolute/path/to/Godot"
      }
    }
  }
}
```

`GODOT_PATH` is optional when Godot can be detected automatically. `DEBUG=true` enables additional server diagnostics on stderr. Keep the allowed roots as narrow as practical; do not use a home directory or filesystem-wide root as a convenience default.

## Security and operating guidance

The server requires configured allowed roots and applies canonical containment and child-path checks to exposed project-scoped filesystem handlers. These roots are not an operating-system sandbox; runtime Godot capabilities, project code, validation/use races, and host process permissions remain outside that guarantee. The server uses argument-array process execution rather than shell interpolation. Its temporary runtime helper listens on loopback using an ephemeral port and a session-scoped token. These implementation controls do not make every Godot operation harmless or a project trustworthy.

MCP tools run with the host process's permissions. Project-scoped file and editing tools can read or change content under allowed roots, and runtime tools can affect the running game. Prefer a disposable project, configure a narrow root, use the host's approval controls, and enable only the tools needed for the task. Do not put credentials or private project data in public issues or logs. See [SECURITY.md](SECURITY.md) and [hardening notes](docs/HARDENING.md).

## Runtime integration

For runtime tools, `run_project` temporarily installs the interaction helper and registers it for the selected project. On stop, the server attempts to restore the original project configuration and remove generated helper files; it preserves concurrent edits when cleanup detects a conflict. Do not add a permanent MCP autoload manually. See [architecture](docs/ARCHITECTURE.md) for lifecycle details.

## Development checks

```bash
npm ci
npm run build
npm test
npm run test:stdio
npm run test:stale-token
npm audit --omit=dev
```

`npm test` runs the Vitest suite. The stdio and stale-token scripts exercise additional transport and runtime-session behavior. These checks do not replace review of tool side effects or validation in the target MCP client and Godot version.

## License and attribution

This derivative is licensed under the MIT License; see [`LICENSE`](LICENSE). It retains upstream attribution to Solomon Elias (Coding-Solo) and Tugcan Topaloglu. See [Acknowledgments](#acknowledgments).

## Acknowledgments

- [Coding-Solo/godot-mcp](https://github.com/Coding-Solo/godot-mcp) by [Solomon Elias (Coding-Solo)](https://github.com/Coding-Solo) supplied foundational MCP server, headless Godot operations, and runtime interaction architecture.
- [tugcantopaloglu/godot-mcp](https://github.com/tugcantopaloglu/godot-mcp) by [Tugcan Topaloglu](https://github.com/tugcantopaloglu) supplied the intermediate derivative on which this repository builds.
