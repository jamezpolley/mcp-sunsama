# Sunsama → Kimai Time-Tracking Sync

Interactive workflow for syncing Sunsama daily tasks into Kimai timesheet entries. Claude mediates — this is NOT automated.

## MCP Servers Required

| Server | Type | Purpose |
|--------|------|---------|
| Official Sunsama HTTP MCP (`https://api.sunsama.com/mcp`) | HTTP | Task management, timeboxing, calendar |
| `sunsama-timing` (this fork, stdio) | stdio | Full task data including `actualTime[]` |
| `kimai-mcp` (from parent repo) | stdio | Create timesheet entries |

## Sync Steps

1. **Fetch tasks for the day** using `get-tasks-by-day` from the `sunsama-timing` MCP (format: json). This returns full task data including `actualTime[]`.

2. **Determine time spent per task** using this priority order:
   - `actualTime[]` — timer entries recorded in Sunsama (most accurate)
   - `timeboxEventIds` duration — calendar block duration if task was timeboxed
   - `importedFrom` calendar event duration — for meetings imported from Google Calendar
   - `timeEstimate` — fallback only

3. **For calendar-imported meeting tasks** (`importedFrom.service === "googleCalendar"`): ask James how long the meeting actually ran (may differ from the calendar event), then create a timebox via `timebox_a_task_to_calendar` and use that duration for Kimai.

4. **Map task → Kimai project/activity** using `kimai-mcp/channel-mapping.json` in the parent repo. The mapping is keyed by Sunsama channel/stream name.
   - For `OAF Finance` channel: route by task content (see routing hints in the mapping file)

5. **Confirm proposed entries** with James before creating anything in Kimai.

6. **Create timesheet entries** via `kimai-mcp`.

## actualTime Data Structure

Each entry in `task.actualTime[]`:
```json
{
  "userId": "...",
  "startDate": "2026-04-28T01:00:00.000Z",
  "endDate":   "2026-04-28T01:59:00.000Z",
  "duration": 3540,
  "isTimerEntry": true
}
```

- `isTimerEntry: true` — recorded by Sunsama's built-in timer
- `isTimerEntry: false` — manually entered duration (duration field is authoritative, start/end may be approximate)
- Multiple entries per task are possible (e.g., worked on it in two sessions)
- Subtasks carry their own `actualTime[]` — check both parent and subtask arrays

All timestamps are UTC. James is in AEST (UTC+10) or AEDT (UTC+11).

## Notes on Specific Task Types

**Ritual tasks** (Daily planning, Daily shutdown): Auto-created by Sunsama, never timed. `actualTime` will always be empty — safe to exclude from Kimai sync.

**Gmail-imported tasks completed in bulk** (quick inbox triage): Often have `actualTime: []`. Either estimate from context or ask James.

**Laundry and personal tasks**: May have timer entries from multiple days if done in pieces. The timer reflects actual time spent, not elapsed wall time.

**Tasks with subtasks**: Parent task may have no `actualTime` while subtasks do (e.g., "Struggling to secure funding" has timing in its subtasks). Always check subtasks.

## Channel → Kimai Mapping

Channel mapping lives at `../kimai-mcp/channel-mapping.json` relative to this file. It maps Sunsama stream names to Kimai project + activity pairs. When a task's stream isn't in the mapping, ask James.

## Kimai Rounding

Kimai rounds timesheet entries to 6-minute increments intentionally. This is expected behaviour — don't try to work around it.
