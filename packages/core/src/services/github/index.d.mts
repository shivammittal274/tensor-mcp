import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../transports/pipedream/types";

export const app: PipedreamAppModule;
export const getCurrentUser: PipedreamActionModule;
export const listRepositories: PipedreamActionModule;
export const getRepository: PipedreamActionModule;
export const createIssue: PipedreamActionModule;
export const listCommits: PipedreamActionModule;
export const createIssueComment: PipedreamActionModule;
export const actions: PipedreamActionModule[];
