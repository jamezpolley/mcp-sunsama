import { SunsamaClient } from "sunsama-api";
import {
  type CreateObjectiveInput,
  createObjectiveSchema,
  type UpdateObjectiveInput,
  updateObjectiveSchema,
  type UpdateTaskObjectiveIdInput,
  updateTaskObjectiveIdSchema,
} from "../schemas.js";
import {
  formatJsonResponse,
  withTransportClient,
  type ToolContext,
} from "./shared.js";

const CREATE_OBJECTIVE_MUTATION = `
mutation createObjective($objective: ObjectiveInput!, $groupId: String!) {
  createObjective(objective: $objective, groupId: $groupId)
}
`;

const UPDATE_OBJECTIVE_MUTATION = `
mutation updateObjective($update: ObjectiveInput!, $objectiveId: String!, $groupId: String!) {
  updateObjective(update: $update, objectiveId: $objectiveId, groupId: $groupId)
}
`;

const UPDATE_TASK_OBJECTIVE_ID_MUTATION = `
mutation updateTaskObjectiveId($input: UpdateTaskObjectiveIdInput!) {
  updateTaskObjectiveId(input: $input) {
    success
    skipped
    __typename
  }
}
`;

async function ensureGroupId(client: any): Promise<string> {
  if (!client.groupId) await client.getUser();
  return client.groupId;
}

export const createObjectiveTool = withTransportClient({
  name: "create-objective",
  description:
    "Create a new weekly objective. Objectives are week-scoped goals that tasks can be aligned to.",
  parameters: createObjectiveSchema,
  execute: async (
    { text, weekStart, streamId, timeEstimate }: CreateObjectiveInput,
    context: ToolContext,
  ) => {
    const client = context.client as any;
    const groupId = await ensureGroupId(client);

    const user = await client.getUser();
    const userId = user._id;

    const objectiveId = SunsamaClient.generateTaskId();
    const now = new Date().toISOString();

    await client.graphqlRequest({
      operationName: "createObjective",
      variables: {
        objective: {
          _id: objectiveId,
          text,
          groupId,
          userId,
          createdAt: now,
          lastModified: now,
          completed: false,
          completedAt: null,
          deleted: false,
          ordinal: 0,
          parentObjectiveId: null,
          period: { interval: "week", start: weekStart, end: null },
          streamId: streamId ?? null,
          taskIds: [],
          timeEstimate: timeEstimate ?? null,
        },
        groupId,
      },
      query: CREATE_OBJECTIVE_MUTATION,
    });

    return formatJsonResponse({
      success: true,
      objectiveId,
      text,
      weekStart,
      created: true,
    });
  },
});

export const updateObjectiveTool = withTransportClient({
  name: "update-objective",
  description:
    "Update an objective — mark complete/incomplete, rename, delete, update time estimate, change stream, or replace linked task IDs. Only provide fields you want to change.",
  parameters: updateObjectiveSchema,
  execute: async (
    {
      objectiveId,
      text,
      completed,
      completedAt,
      deleted,
      timeEstimate,
      streamId,
      taskIds,
    }: UpdateObjectiveInput,
    context: ToolContext,
  ) => {
    const client = context.client as any;
    const groupId = await ensureGroupId(client);

    const update: Record<string, unknown> = {
      lastModified: new Date().toISOString(),
    };
    if (text !== undefined) update.text = text;
    if (completed !== undefined) update.completed = completed;
    if (completedAt !== undefined) update.completedAt = completedAt;
    if (deleted !== undefined) update.deleted = deleted;
    if (timeEstimate !== undefined) update.timeEstimate = timeEstimate;
    if (streamId !== undefined) update.streamId = streamId;
    if (taskIds !== undefined) update.taskIds = taskIds;

    await client.graphqlRequest({
      operationName: "updateObjective",
      variables: { update, objectiveId, groupId },
      query: UPDATE_OBJECTIVE_MUTATION,
    });

    return formatJsonResponse({
      success: true,
      objectiveId,
      updated: Object.keys(update).filter((k) => k !== "lastModified"),
    });
  },
});

export const updateTaskObjectiveIdTool = withTransportClient({
  name: "update-task-objective-id",
  description:
    "Link a task to an objective, or unlink it by passing objectiveId: null.",
  parameters: updateTaskObjectiveIdSchema,
  execute: async (
    { taskId, objectiveId, limitResponsePayload }: UpdateTaskObjectiveIdInput,
    context: ToolContext,
  ) => {
    const response = await (context.client as any).graphqlRequest({
      operationName: "updateTaskObjectiveId",
      variables: {
        input: {
          taskId,
          objectiveId,
          limitResponsePayload: limitResponsePayload ?? true,
        },
      },
      query: UPDATE_TASK_OBJECTIVE_ID_MUTATION,
    });

    const result = response?.data?.updateTaskObjectiveId;
    return formatJsonResponse({
      success: result?.success ?? false,
      taskId,
      objectiveId,
      linked: objectiveId !== null,
    });
  },
});

export const objectiveTools = [
  createObjectiveTool,
  updateObjectiveTool,
  updateTaskObjectiveIdTool,
];
