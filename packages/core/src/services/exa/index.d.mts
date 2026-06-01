import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../transports/pipedream/types";

export const app: PipedreamAppModule;
export const answerQuestion: PipedreamActionModule;
export const findSimilarLinks: PipedreamActionModule;
export const getContents: PipedreamActionModule;
export const search: PipedreamActionModule;
export const actions: PipedreamActionModule[];
