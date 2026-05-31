import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../adapt/pipedream/types";

export const app: PipedreamAppModule;
export const sendMessage: PipedreamActionModule;
export const findMessage: PipedreamActionModule;
export const listChannels: PipedreamActionModule;
export const actions: PipedreamActionModule[];
