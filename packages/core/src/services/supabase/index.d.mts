import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../transports/pipedream/types";

export const app: PipedreamAppModule;
export const batchInsertRows: PipedreamActionModule;
export const countRows: PipedreamActionModule;
export const deleteRow: PipedreamActionModule;
export const insertRow: PipedreamActionModule;
export const remoteProcedureCall: PipedreamActionModule;
export const selectRow: PipedreamActionModule;
export const updateRow: PipedreamActionModule;
export const upsertRow: PipedreamActionModule;
export const actions: PipedreamActionModule[];
