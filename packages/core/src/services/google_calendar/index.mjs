import app from "./google_calendar.app.mjs";
import addAttendeesToEvent from "./actions/add-attendees-to-event/add-attendees-to-event.mjs";
import createEvent from "./actions/create-event/create-event.mjs";
import deleteEvent from "./actions/delete-event/delete-event.mjs";
import getCalendar from "./actions/get-calendar/get-calendar.mjs";
import getCurrentUser from "./actions/get-current-user/get-current-user.mjs";
import getDateTime from "./actions/get-date-time/get-date-time.mjs";
import getEvent from "./actions/get-event/get-event.mjs";
import listCalendars from "./actions/list-calendars/list-calendars.mjs";
import listColorIdOptions from "./actions/list-color-id-options/list-color-id-options.mjs";
import listEventInstances from "./actions/list-event-instances/list-event-instances.mjs";
import listEvents from "./actions/list-events/list-events.mjs";
import queryFreeBusyCalendars from "./actions/query-free-busy-calendars/query-free-busy-calendars.mjs";
import quickAddEvent from "./actions/quick-add-event/quick-add-event.mjs";
import updateEvent from "./actions/update-event/update-event.mjs";
import updateEventInstance from "./actions/update-event-instance/update-event-instance.mjs";
import updateFollowingInstances from "./actions/update-following-instances/update-following-instances.mjs";

export { app, addAttendeesToEvent, createEvent, deleteEvent, getCalendar, getCurrentUser, getDateTime, getEvent, listCalendars, listColorIdOptions, listEventInstances, listEvents, queryFreeBusyCalendars, quickAddEvent, updateEvent, updateEventInstance, updateFollowingInstances };
export const actions = [
  addAttendeesToEvent,
  createEvent,
  deleteEvent,
  getCalendar,
  getCurrentUser,
  getDateTime,
  getEvent,
  listCalendars,
  listColorIdOptions,
  listEventInstances,
  listEvents,
  queryFreeBusyCalendars,
  quickAddEvent,
  updateEvent,
  updateEventInstance,
  updateFollowingInstances,
];
