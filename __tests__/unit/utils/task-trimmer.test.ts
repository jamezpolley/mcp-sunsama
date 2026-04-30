import { describe, test, expect } from "bun:test";
import type { Task, TaskActualTime } from "sunsama-api/types";
import {
  trimTaskForResponse,
  trimTaskWithTimingForResponse,
  trimTasksForResponse,
  trimTasksWithTimingForResponse,
} from "../../../src/utils/task-trimmer.js";

// Minimal Task fixture builder. The sunsama-api Task type has many required
// fields we don't care about for trimmer tests; cast through `unknown` to
// keep these fixtures readable.
function makeActualTime(overrides: Partial<TaskActualTime> = {}): TaskActualTime {
  return {
    userId: "user-1",
    startDate: "2026-04-30T09:00:00.000Z",
    endDate: "2026-04-30T09:30:00.000Z",
    duration: 1800,
    isTimerEntry: true,
    __typename: "TaskActualTime",
    ...overrides,
  };
}

function makeTask(overrides: Record<string, unknown> = {}): Task {
  const base = {
    _id: "task-1",
    text: "Sample task",
    completed: false,
    assigneeId: "user-1",
    createdAt: "2026-04-30T08:00:00.000Z",
    lastModified: "2026-04-30T09:30:00.000Z",
    objectiveId: null,
    completeDate: null,
    timeEstimate: 1800,
    dueDate: null,
    notes: { html: "<p>notes</p>" },
    streamIds: ["stream-1"],
    integration: null,
    subtasks: [
      {
        _id: "sub-1",
        title: "Subtask one",
        completedDate: null,
        timeEstimate: 600,
        actualTime: makeActualTime({ duration: 600 }),
        __typename: "TaskSubtask",
      },
      {
        _id: "sub-2",
        title: "Subtask two",
        completedDate: "2026-04-30T09:15:00.000Z",
        timeEstimate: null,
        actualTime: null,
        __typename: "TaskSubtask",
      },
    ],
    actualTime: [makeActualTime()],
    scheduledTime: [],
    // Padding so the cast satisfies the runtime shape; trimmer never reads these.
    groupId: "g-1",
    private: false,
    deleted: false,
    createdBy: "user-1",
    duration: null,
    taskType: "task",
    notesChecksum: "abc",
    notesMarkdown: "notes",
    backlogOrderings: [],
    orderings: [],
    comments: [],
    followers: [],
    seededEventIds: [],
    __typename: "Task",
  };
  return { ...base, ...overrides } as unknown as Task;
}

describe("trimTaskForResponse (default)", () => {
  test("strips actualTime and reduces subtasks to titles", () => {
    const trimmed = trimTaskForResponse(makeTask());

    expect(trimmed).not.toHaveProperty("actualTime");
    expect(trimmed).not.toHaveProperty("scheduledTime");
    expect(trimmed.subtasks).toEqual(["Subtask one", "Subtask two"]);
  });

  test("preserves core fields", () => {
    const trimmed = trimTaskForResponse(makeTask());

    expect(trimmed._id).toBe("task-1");
    expect(trimmed.text).toBe("Sample task");
    expect(trimmed.timeEstimate).toBe(1800);
    expect(trimmed.streamIds).toEqual(["stream-1"]);
  });

  test("integration is null when absent", () => {
    const trimmed = trimTaskForResponse(makeTask({ integration: null }));
    expect(trimmed.integration).toBeNull();
  });
});

describe("trimTaskWithTimingForResponse (includeActualTime)", () => {
  test("includes parent actualTime[]", () => {
    const trimmed = trimTaskWithTimingForResponse(makeTask());

    expect(trimmed.actualTime).toHaveLength(1);
    expect(trimmed.actualTime[0]).toMatchObject({
      duration: 1800,
      isTimerEntry: true,
    });
  });

  test("expands subtasks with timing fields", () => {
    const trimmed = trimTaskWithTimingForResponse(makeTask());

    expect(trimmed.subtasks).toHaveLength(2);
    expect(trimmed.subtasks[0]).toEqual({
      _id: "sub-1",
      title: "Subtask one",
      completedDate: null,
      timeEstimate: 600,
      actualTime: expect.objectContaining({ duration: 600, isTimerEntry: true }),
    });
    expect(trimmed.subtasks[1]).toEqual({
      _id: "sub-2",
      title: "Subtask two",
      completedDate: "2026-04-30T09:15:00.000Z",
      timeEstimate: null,
      actualTime: null,
    });
  });

  test("defaults parent actualTime to [] when missing", () => {
    const trimmed = trimTaskWithTimingForResponse(
      makeTask({ actualTime: undefined }),
    );
    expect(trimmed.actualTime).toEqual([]);
  });

  test("preserves the same core fields as the default trimmer", () => {
    const task = makeTask();
    const plain = trimTaskForResponse(task);
    const timed = trimTaskWithTimingForResponse(task);

    expect(timed._id).toBe(plain._id);
    expect(timed.text).toBe(plain.text);
    expect(timed.streamIds).toEqual(plain.streamIds);
    expect(timed.timeEstimate).toBe(plain.timeEstimate as number);
  });
});

describe("array helpers", () => {
  test("trimTasksForResponse maps each task", () => {
    const trimmed = trimTasksForResponse([
      makeTask({ _id: "a" }),
      makeTask({ _id: "b" }),
    ]);
    expect(trimmed.map((t) => t._id)).toEqual(["a", "b"]);
    expect(trimmed[0]).not.toHaveProperty("actualTime");
  });

  test("trimTasksWithTimingForResponse maps each task and includes timing", () => {
    const trimmed = trimTasksWithTimingForResponse([
      makeTask({ _id: "a" }),
      makeTask({ _id: "b" }),
    ]);
    expect(trimmed.map((t) => t._id)).toEqual(["a", "b"]);
    expect(trimmed[0].actualTime).toHaveLength(1);
    expect(trimmed[0].subtasks[0]).toHaveProperty("actualTime");
  });
});
