# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Fork Status

This is a personal fork of [robertn702/mcp-sunsama](https://github.com/robertn702/mcp-sunsama).
Upstream remote: `upstream` (robertn702). Origin: `jamezpolley/mcp-sunsama`.

**Additions in this fork (vs upstream):**
- Opt-in `format: "json"` flag on `get-tasks-by-day`, `get-tasks-backlog`, `get-archived-tasks`
- Calendar tools: `get-calendar-events`, `create-calendar-event`, `update-calendar-event`
- MCP Resources: `sunsama://user/calendars`, `sunsama://user/integrations`, `sunsama://api/docs`
- `run.ps1` for Windows/1Password credential injection via `op run`
- `mise.toml` pinning `bun = "latest"` for tool management

This fork is used as the `sunsama-timing` MCP entry in the parent repo's `.mcp.json`.
See `docs/SYNC.md` for the Sunsama→Kimai time-tracking sync workflow.

## Development Commands

```bash
# Development
bun run dev                 # Run server with .env file
bun run typecheck          # TypeScript type checking
bun run typecheck:watch    # Watch mode type checking
bun run inspect            # MCP Inspector for debugging

# Testing
bun test                   # Run unit tests only
bun test:unit              # Run unit tests only (alias)
bun test:integration       # Run integration tests (requires credentials)
bun test:all               # Run all tests
bun test:watch             # Watch mode for unit tests

# Build and Distribution
bun run build              # Compile TypeScript to dist/
bun run prepublishOnly     # Run build before publish

# Version Management (Changeset)
bun run changeset          # Create new changeset
bun run version            # Apply changesets and update version (auto-syncs src/constants.ts)
bun run release            # Build and publish to npm
```

## Windows / 1Password Setup

On Windows, run `run.ps1` instead of `run.sh`. It injects credentials via `op run`:

```powershell
# run.ps1
$env:SUNSAMA_EMAIL = "op://Private/Sunsama/email"
$env:SUNSAMA_PASSWORD = "op://Private/Sunsama/password"
op run --account T26JAJX2KFGJ7PCGFCVGVYHOHA -- node dist/main.js
```

Register in `.mcp.json`:
```json
"sunsama-timing": {
  "type": "stdio",
  "command": "pwsh",
  "args": ["-NoProfile", "-NonInteractive", "-File", "C:\\path\\to\\mcp-sunsama\\run.ps1"]
}
```

**Build note**: `postbuild` runs `chmod +x dist/main.js` which fails on Windows — this is harmless. Run `node_modules\.bin\tsc` directly to bypass it if needed.

## Architecture Overview

### Dual Transport MCP Server
This server supports two transport modes with different authentication strategies:

**Stdio Transport** (default):
- Single global SunsamaClient authenticated at startup
- Uses `SUNSAMA_EMAIL`/`SUNSAMA_PASSWORD` environment variables
- Session maintained for entire server lifetime

**HTTP Stream Transport**:
- Per-request authentication via HTTP Basic Auth
- Session-isolated SunsamaClient instances
- Credentials provided in Authorization header

Transport selection via `TRANSPORT_MODE` environment variable ("stdio" | "http").

### Session Management Architecture
For HTTP transport, the server implements dual-layer session caching:

**Client Cache Layer** (`utils/client-resolver.ts`):
- In-memory Map caching authenticated SunsamaClient instances
- SHA-256 hashed credential keys for security
- Automatic cache invalidation on authentication failure

**Session Manager Layer** (`session/session-manager.ts`):
- Manages session lifecycle with configurable TTL
- Tracks session metadata (createdAt, lastAccessedAt)
- Automatic cleanup of expired sessions
- Transport reference management for proper cleanup

### Client Resolution Pattern
`utils/client-resolver.ts` abstracts transport differences:
- **Stdio**: Returns singleton client from global authentication
- **HTTP**: Extracts client from session data (authenticated per request)
- Throws standardized errors for unauthenticated requests

**Important**: `client.groupId` is only populated after `client.getUser()` is called — `login()` does not set it. Any raw `graphqlRequest` call that needs groupId must call `if (!client.groupId) await client.getUser()` first. Built-in library methods handle this internally, but direct GraphQL calls do not.

### Raw GraphQL Calls
The sunsama-api library exposes a `graphqlRequest` method for queries not wrapped by the SDK:

```typescript
const response = await (client as any).graphqlRequest({
  operationName: "queryName",
  variables: { groupId, ...otherVars },
  query: GRAPHQL_QUERY_STRING,
});
```

Use this pattern sparingly — prefer SDK methods when available. If a new operation is needed, capture it from the Sunsama web app's DevTools Network tab.

### Response Optimization Strategy
Two-tier optimization for large datasets:

1. **Task Filtering** (`utils/task-filters.ts`): Filter by completion status before processing
2. **Task Trimming** (`utils/task-trimmer.ts`): Remove non-essential fields to reduce payload by 60-80%

Always apply filtering before trimming for efficiency. Note: `actualTime[]` is stripped by the trimmer — use `get-task-by-id` to get full timing data for individual tasks.

### Enhanced Pagination Pattern
`get-archived-tasks` implements smart pagination:
- **Limit+1 Pattern**: Fetches `requestedLimit + 1` to determine if more results exist
- **Pagination Metadata**: Returns `hasMore` flag, `nextOffset`, and count information

### Schema Architecture
All tools use Zod schemas from `schemas.ts`:
- Type-safe parameter validation with automatic TypeScript inference
- **Important**: Avoid `.refine()` on schemas — it transforms `ZodObject` into `ZodEffects` which the MCP SDK cannot parse (results in empty `properties`). Handle complex validation in the tool's `execute` function instead.
- Example: `update-task-notes` XOR between `html`/`markdown` is validated at runtime
- Discriminated unions for task integrations (GitHub, Gmail)

### Output Formatting
- **JSON**: Single objects (user data, calendar events); also available for array tools via `format: "json"`
- **TSV**: Arrays (tasks, streams) — default; optimized for Claude's data processing
- Use `formatTaskArrayResponse(data, format)` from `tools/shared.ts` for tools that support both

## Code Organization

```
src/
├── tools/
│   ├── shared.ts          # Common utilities and tool wrapper patterns
│   ├── user-tools.ts      # User operations: get-user
│   ├── task-tools.ts      # Task operations: ~20 tools (CRUD, subtasks)
│   ├── bulk-task-tools.ts # Bulk operations: 5 tools (complete/uncomplete/delete/snooze/backlog)
│   ├── stream-tools.ts    # Stream operations: get-streams
│   ├── calendar-tools.ts  # Calendar operations: get/create/update-calendar-event
│   └── index.ts           # Export all tools
├── resources/
│   └── index.ts           # MCP resources: api/docs, user/calendars, user/integrations
├── auth/                  # Authentication strategies per transport type
│   ├── stdio.ts
│   ├── http.ts
│   └── types.ts
├── transports/
│   ├── stdio.ts
│   └── http.ts            # HTTP Stream transport with session management
├── session/
│   └── session-manager.ts
├── config/
│   ├── transport.ts
│   └── session-config.ts
├── utils/
│   ├── client-resolver.ts
│   ├── task-filters.ts
│   ├── task-trimmer.ts
│   └── to-tsv.ts
├── schemas.ts             # Zod schemas for all tools
└── main.ts                # Server setup

__tests__/
├── unit/                  # Unit tests (no auth required)
└── integration/           # Integration tests (requires credentials)
```

### Shared Utilities (`tools/shared.ts`)
- `withTransportClient()`: Wraps tools with transport-aware client resolution and error handling
- `formatJsonResponse()`, `formatTsvResponse()`: Response formatters
- `formatTaskArrayResponse(data, format?)`: Switches TSV↔JSON based on optional `format` param
- `formatPaginatedTsvResponse()`, `formatTaskArrayPaginatedResponse()`: Pagination support

## Important Notes

### Task Operations
Full CRUD support across ~30 tools:
- **Read**: `get-tasks-by-day`, `get-tasks-backlog`, `get-archived-tasks`, `get-task-by-id`
- **Write**: `create-task`, `update-task-complete`, `update-task-planned-time`, `update-task-notes`, `update-task-snooze-date`, `update-task-backlog`, `update-task-stream`, `update-task-text`, `update-task-due-date`, `delete-task`
- **Subtasks**: `add-subtask`, `create-subtasks`, `update-subtask-title`, `complete-subtask`, `uncomplete-subtask`
- **Bulk**: `update-task-complete-bulk`, `update-task-uncomplete-bulk`, `delete-task-bulk`, `update-task-snooze-date-bulk`, `update-task-backlog-bulk`
- **Calendar**: `get-calendar-events`, `create-calendar-event`, `update-calendar-event`
- **Streams**: `get-streams`
- **User**: `get-user`

Array-returning read tools (`get-tasks-by-day`, `get-tasks-backlog`, `get-archived-tasks`) accept an optional `format: "json"` parameter to switch from TSV to JSON output.

### MCP Resources
Three resources registered (accessible via `list_resources` / `read_resource`):
- `sunsama://api/docs` — Tool documentation
- `sunsama://user/calendars` — All calendar accounts and their config
- `sunsama://user/integrations` — Connected integrations (GitHub, Slack, Todoist, Gmail, etc.)

### Calendar Tools
`get-calendar-events` defaults to the internal Sunsama calendar (auto-resolved by querying `getGroupEdge` for `service === "sunsama-calendar"`). Pass `calendarId` to query a specific Google Calendar.

**Note**: The internal Sunsama calendar contains timer/projection blocks rendered in the UI, but these are typically empty via API. Timer data lives in `task.actualTime[]`, not as calendar events.

### actualTime Data
`task.actualTime[]` contains timer entries for each task:
```typescript
{
  userId: string,
  startDate: string,   // ISO UTC
  endDate: string,     // ISO UTC
  duration: number,    // seconds
  isTimerEntry: boolean  // false = manual entry
}
```
The trimmer strips `actualTime` from list responses. To get it, use `get-task-by-id` (returns full untrimmed task). Subtasks also carry their own `actualTime[]`.

**Timing data priority for Kimai sync**: `actualTime` → `timeboxEventIds` duration → `importedFrom` calendar event duration → `timeEstimate`

### Environment Variables
Required for stdio transport:
- `SUNSAMA_EMAIL`: Sunsama account email
- `SUNSAMA_PASSWORD`: Sunsama account password

Optional:
- `TRANSPORT_MODE`: "stdio" (default) | "http"
- `PORT`: Server port (default: 3002, HTTP transport only)
- `SESSION_TTL`: Session timeout ms (default: 3600000)
- `CLIENT_IDLE_TIMEOUT`: Client idle timeout ms (default: 900000)
- `MAX_SESSIONS`: Maximum concurrent sessions for HTTP transport (default: 100)

### Version Synchronization
`bun run version` automatically syncs `src/constants.ts` from `package.json` via `scripts/sync-version.ts`. No manual update needed.

### Git Rules
**IMPORTANT**: Never commit the `dev/` directory. It contains sample API responses and local testing data.

**Branch Naming**: `{type}/{short-name}` — feat, fix, chore, refactor, docs, test, ci.

## TODOs

- [ ] Remove `test-group-edge.mts` from repo root (temp test file, should be in `dev/` or deleted)
- [ ] Consider upstreaming JSON format flag and calendar tools to robertn702/mcp-sunsama
- [ ] Add opt-in `includeActualTime` flag to list tools (currently requires N+1 `get-task-by-id` calls)
- [ ] Periodically sync upstream changes: `git fetch upstream && git merge upstream/main`
