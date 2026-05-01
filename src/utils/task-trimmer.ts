import type { Task, TaskActualTime, TaskIntegration, TaskSubtask } from "sunsama-api/types";

/**
 * Trimmed task type containing only essential properties for API responses.
 * Reduces response size by 60-80% while preserving core task information.
 *
 * Extends core Task properties with simplified versions of complex fields:
 * - integration: Service name only (instead of full nested object)
 * - subtasks: Array of titles only (instead of full subtask objects)
 */
export type TrimmedTask = Pick<Task,
  | '_id'
  | 'text'
  | 'completed'
  | 'assigneeId'
  | 'createdAt'
  | 'lastModified'
  | 'objectiveId'
  | 'completeDate'
  | 'timeEstimate'
  | 'dueDate'
  | 'notes'
  | 'streamIds'
> & {
  /** Integration service name (e.g., 'website', 'googleCalendar') or null */
  integration: {
    service: TaskIntegration['service'];
    url?: string;
  } | null;
  /** Array of subtask titles only (simplified from full subtask objects) */
  subtasks: string[];
  /** Per-day priority entries for this task (beta feature). Empty array if none set. */
  dailyPriority: Array<{ priority: string; day: string }>;
  /** Backlog priority level for this task, or null if not set. */
  backlogPriority: string | null;
};

/**
 * Subtask shape used when actualTime data is requested. Carries enough
 * information to reconcile per-subtask timer entries against the parent task.
 */
export type TimedSubtask = {
  _id: string;
  title: string;
  completedDate?: string | null;
  timeEstimate?: number | null;
  actualTime?: TaskActualTime | null;
};

/**
 * Trimmed task type that includes actualTime data for the parent and
 * per-subtask timer entries. Used when the caller passes
 * `includeActualTime: true` to a list tool.
 */
export type TrimmedTaskWithTiming = Omit<TrimmedTask, 'subtasks'> & {
  /** Array of timer entries (manual + active timer) for the parent task. */
  actualTime: TaskActualTime[];
  /** Subtasks expanded with timing fields. */
  subtasks: TimedSubtask[];
};

function buildIntegration(task: Task): TrimmedTask['integration'] {
  if (!task.integration) return null;

  // Extract minimal integration data: service type and URL if available
  // Integration identifiers vary by service - some have URLs (websites), others have different properties
  const integration: { service: TaskIntegration['service']; url?: string } = {
    service: task.integration.service,
  };
  if (task.integration.identifier && "url" in task.integration.identifier) {
    integration.url = task.integration.identifier.url;
  }
  return integration;
}

/**
 * Trims a task object to include only essential properties for API responses.
 *
 * Included properties:
 * - Core identifiers: _id, assigneeId, objectiveId
 * - Content: text, notes
 * - Status: completed, completeDate
 * - Timestamps: createdAt, lastModified
 * - Planning: timeEstimate, dueDate, streamIds
 * - Simplified integration: service name only (not full nested object)
 * - Simplified subtasks: titles only (not full objects with metadata)
 *
 * Excluded properties (for size reduction):
 * - Internal metadata: notesChecksum, editorVersion, collabSnapshot, __typename
 * - Complex nested objects: full integration objects, sequence, ritual, eventInfo, runDate, timeHorizon
 * - Large arrays: comments, orderings, backlogOrderings, actualTime, scheduledTime, full subtask objects
 * - UI state: subtasksCollapsed, seededEventIds, followers
 * - Redundant fields: completedBy, completeOn, recommendedTimeEstimate, recommendedStreamId, notesMarkdown
 * - Metadata: groupId, taskType, private, deleted, createdBy, archivedAt, duration
 *
 * @param task - Full task object from Sunsama API
 * @returns Trimmed task object with only essential properties
 */
export function trimTaskForResponse(task: Task): TrimmedTask {
  return {
    _id: task._id,
    assigneeId: task.assigneeId,
    completeDate: task.completeDate,
    completed: task.completed,
    createdAt: task.createdAt,
    dueDate: task.dueDate,
    integration: buildIntegration(task),
    lastModified: task.lastModified,
    notes: task.notes,
    objectiveId: task.objectiveId,
    streamIds: task.streamIds,
    subtasks: task.subtasks.map((st) => st.title),
    text: task.text,
    timeEstimate: task.timeEstimate,
    dailyPriority: (task as any).dailyPriority ?? [],
    backlogPriority: (task as any).backlogPriority ?? null,
  };
}

/**
 * Variant of {@link trimTaskForResponse} that preserves actualTime data
 * (parent timer entries and per-subtask timing). Subtasks are expanded
 * from titles-only into objects so callers can match timer entries to
 * the subtask they belong to.
 *
 * @param task - Full task object from Sunsama API
 * @returns Trimmed task with parent actualTime[] and rich subtasks.
 */
export function trimTaskWithTimingForResponse(task: Task): TrimmedTaskWithTiming {
  const subtasks: TimedSubtask[] = task.subtasks.map((st: TaskSubtask) => ({
    _id: st._id,
    title: st.title,
    completedDate: st.completedDate ?? null,
    timeEstimate: st.timeEstimate ?? null,
    actualTime: st.actualTime ?? null,
  }));

  return {
    _id: task._id,
    assigneeId: task.assigneeId,
    completeDate: task.completeDate,
    completed: task.completed,
    createdAt: task.createdAt,
    dueDate: task.dueDate,
    integration: buildIntegration(task),
    lastModified: task.lastModified,
    notes: task.notes,
    objectiveId: task.objectiveId,
    streamIds: task.streamIds,
    text: task.text,
    timeEstimate: task.timeEstimate,
    actualTime: task.actualTime ?? [],
    subtasks,
    dailyPriority: (task as any).dailyPriority ?? [],
    backlogPriority: (task as any).backlogPriority ?? null,
  };
}

/**
 * Trims an array of task objects to include only essential properties.
 *
 * @param tasks - Array of full task objects from Sunsama API
 * @returns Array of trimmed task objects
 */
export function trimTasksForResponse(tasks: Task[]): TrimmedTask[] {
  return tasks.map(trimTaskForResponse);
}

/**
 * Trims an array of task objects, preserving parent + subtask actualTime.
 *
 * @param tasks - Array of full task objects from Sunsama API
 * @returns Array of trimmed-with-timing task objects.
 */
export function trimTasksWithTimingForResponse(tasks: Task[]): TrimmedTaskWithTiming[] {
  return tasks.map(trimTaskWithTimingForResponse);
}
