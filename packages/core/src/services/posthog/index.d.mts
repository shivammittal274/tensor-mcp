import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../transports/pipedream/types";

export const app: PipedreamAppModule;
export const captureEvent: PipedreamActionModule;
export const createProjectInsight: PipedreamActionModule;
export const createQuery: PipedreamActionModule;
export const getCohorts: PipedreamActionModule;
export const getPersons: PipedreamActionModule;
export const getProjectInsight: PipedreamActionModule;
export const getSurveys: PipedreamActionModule;
export const listOrganizationIdOptions: PipedreamActionModule;
export const listProjectInsights: PipedreamActionModule;
export const updateProjectInsight: PipedreamActionModule;
export const actions: PipedreamActionModule[];
