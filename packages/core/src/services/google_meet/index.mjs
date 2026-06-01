import app from "./google_meet.app.mjs";
import listColorIdOptions from "./actions/list-color-id-options/list-color-id-options.mjs";
import scheduleMeeting from "./actions/schedule-meeting/schedule-meeting.mjs";

export { app, listColorIdOptions, scheduleMeeting };
export const actions = [
  listColorIdOptions,
  scheduleMeeting,
];
