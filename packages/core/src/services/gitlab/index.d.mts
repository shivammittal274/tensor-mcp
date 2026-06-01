import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../transports/pipedream/types";

export const app: PipedreamAppModule;
export const createBranch: PipedreamActionModule;
export const createEpic: PipedreamActionModule;
export const createIssue: PipedreamActionModule;
export const getIssue: PipedreamActionModule;
export const getRepoBranch: PipedreamActionModule;
export const listCommits: PipedreamActionModule;
export const listGroupIdOptions: PipedreamActionModule;
export const listGroupPathOptions: PipedreamActionModule;
export const listGroups: PipedreamActionModule;
export const listProjectIdOptions: PipedreamActionModule;
export const listProjectMembers: PipedreamActionModule;
export const listRepoBranches: PipedreamActionModule;
export const searchIssues: PipedreamActionModule;
export const updateEpic: PipedreamActionModule;
export const updateIssue: PipedreamActionModule;
export const actions: PipedreamActionModule[];
