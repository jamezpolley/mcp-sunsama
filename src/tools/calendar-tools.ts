import type { CalendarEventUpdateData, CreateCalendarEventOptions } from "sunsama-api/types";
import {
  type CreateCalendarEventInput,
  createCalendarEventSchema,
  type GetCalendarEventsInput,
  getCalendarEventsSchema,
  type UpdateCalendarEventInput,
  updateCalendarEventSchema,
} from "../schemas.js";
import {
  formatJsonResponse,
  formatTaskArrayResponse,
  withTransportClient,
  type ToolContext,
} from "./shared.js";

const GET_GROUP_EDGE_CALENDARS_QUERY = `
query getGroupEdge($groupId: String!) {
  currentGroupEdge(groupId: $groupId) {
    integrations {
      calendar { items { id service __typename } __typename }
      __typename
    }
    __typename
  }
}
`;

const GET_CALENDAR_EVENTS_QUERY = `
query getCalendarEvents($startDate: DateTime!, $endDate: DateTime!, $groupId: String!, $calendarId: String!) {
  calendarEventsByCalendarIdSynced(startDate: $startDate, endDate: $endDate, groupId: $groupId, calendarId: $calendarId) {
    calendarEvents {
      _id
      title
      date { startDate endDate isAllDay timeZone __typename }
      status
      service
      serviceIds { google sunsama __typename }
      description
      streamIds
      childTasks { taskId groupId userId __typename }
      __typename
    }
    error
    __typename
  }
}
`;

async function resolveSunsamaCalendarId(client: any): Promise<string> {
  const groupId = client.groupId;
  const response = await client.graphqlRequest({
    operationName: "getGroupEdge",
    variables: { groupId },
    query: GET_GROUP_EDGE_CALENDARS_QUERY,
  });
  const items: any[] = response?.data?.currentGroupEdge?.integrations?.calendar?.items ?? [];
  const sunsamaCal = items.find((item: any) => item.service === "sunsama-calendar");
  if (!sunsamaCal) throw new Error("Could not find internal Sunsama calendar in user's calendar list");
  return sunsamaCal.id;
}

export const getCalendarEventsTool = withTransportClient({
  name: "get-calendar-events",
  description:
    "Get calendar events for a date range. Defaults to the internal Sunsama calendar " +
    "(which contains timer entries and projected time blocks). Pass calendarId to query " +
    "a specific Google Calendar or other connected calendar instead.",
  parameters: getCalendarEventsSchema,
  execute: async (
    { startDate, endDate, calendarId, format }: GetCalendarEventsInput,
    context: ToolContext,
  ) => {
    const client = context.client as any;
    const groupId = client.groupId;

    const resolvedCalendarId = calendarId ?? await resolveSunsamaCalendarId(client);

    const response = await client.graphqlRequest({
      operationName: "getCalendarEvents",
      variables: { startDate, endDate, groupId, calendarId: resolvedCalendarId },
      query: GET_CALENDAR_EVENTS_QUERY,
    });

    if (response?.data?.calendarEventsByCalendarIdSynced?.error) {
      throw new Error(response.data.calendarEventsByCalendarIdSynced.error);
    }

    const events: any[] = response?.data?.calendarEventsByCalendarIdSynced?.calendarEvents ?? [];
    return formatTaskArrayResponse(events, format);
  },
});

export const createCalendarEventTool = withTransportClient({
  name: "create-calendar-event",
  description: "Create a new calendar event in Sunsama",
  parameters: createCalendarEventSchema,
  execute: async (
    {
      title,
      startDate,
      endDate,
      description,
      calendarId,
      service,
      streamIds,
      visibility,
      transparency,
      isAllDay,
      seedTaskId,
    }: CreateCalendarEventInput,
    context: ToolContext,
  ) => {
    const options: CreateCalendarEventOptions = {};
    if (description !== undefined) options.description = description;
    if (calendarId !== undefined) options.calendarId = calendarId;
    if (service !== undefined) options.service = service;
    if (streamIds !== undefined) options.streamIds = streamIds;
    if (visibility !== undefined) options.visibility = visibility;
    if (transparency !== undefined) options.transparency = transparency;
    if (isAllDay !== undefined) options.isAllDay = isAllDay;
    if (seedTaskId !== undefined) options.seedTaskId = seedTaskId;
    options.limitResponsePayload = false;

    const result = await context.client.createCalendarEvent(
      title,
      startDate,
      endDate,
      options,
    );

    return formatJsonResponse({
      success: result.success,
      calendarEvent: result.createdCalendarEvent,
      updatedFields: result.updatedFields,
    });
  },
});

export const updateCalendarEventTool = withTransportClient({
  name: "update-calendar-event",
  description:
    "Update an existing calendar event. Requires the full CalendarEventUpdateData object — fetch the event first to get all required fields.",
  parameters: updateCalendarEventSchema,
  execute: async (
    { eventId, update, isInviteeStatusUpdate, skipReorder }: UpdateCalendarEventInput,
    context: ToolContext,
  ) => {
    const result = await context.client.updateCalendarEvent(
      eventId,
      update as unknown as CalendarEventUpdateData,
      {
        isInviteeStatusUpdate,
        skipReorder,
        limitResponsePayload: false,
      },
    );

    return formatJsonResponse({
      success: result.success,
      skipped: result.skipped,
      calendarEvent: result.updatedCalendarEvent,
      updatedFields: result.updatedFields,
    });
  },
});

export const calendarTools = [
  getCalendarEventsTool,
  createCalendarEventTool,
  updateCalendarEventTool,
];
