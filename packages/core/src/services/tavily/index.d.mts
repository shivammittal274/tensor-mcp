import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../transports/pipedream/types";

export const app: PipedreamAppModule;
export const sendQuery: PipedreamActionModule;
export const actions: PipedreamActionModule[];
