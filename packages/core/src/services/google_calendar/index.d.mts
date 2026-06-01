import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../transports/pipedream/types";

export const app: PipedreamAppModule;
export const addAttendeesToEvent: PipedreamActionModule;
export const createEvent: PipedreamActionModule;
export const deleteEvent: PipedreamActionModule;
export const getCalendar: PipedreamActionModule;
export const getCurrentUser: PipedreamActionModule;
export const getDateTime: PipedreamActionModule;
export const getEvent: PipedreamActionModule;
export const listCalendars: PipedreamActionModule;
export const listColorIdOptions: PipedreamActionModule;
export const listEventInstances: PipedreamActionModule;
export const listEvents: PipedreamActionModule;
export const queryFreeBusyCalendars: PipedreamActionModule;
export const quickAddEvent: PipedreamActionModule;
export const updateEvent: PipedreamActionModule;
export const updateEventInstance: PipedreamActionModule;
export const updateFollowingInstances: PipedreamActionModule;
export const actions: PipedreamActionModule[];
