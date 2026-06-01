import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../transports/pipedream/types";

export const app: PipedreamAppModule;
export const appendImage: PipedreamActionModule;
export const appendText: PipedreamActionModule;
export const createDocument: PipedreamActionModule;
export const createDocumentFromTemplate: PipedreamActionModule;
export const findDocument: PipedreamActionModule;
export const getDocument: PipedreamActionModule;
export const getTabContent: PipedreamActionModule;
export const insertPageBreak: PipedreamActionModule;
export const insertTable: PipedreamActionModule;
export const insertText: PipedreamActionModule;
export const replaceImage: PipedreamActionModule;
export const replaceText: PipedreamActionModule;
export const actions: PipedreamActionModule[];
