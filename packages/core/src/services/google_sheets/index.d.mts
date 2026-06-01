import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../transports/pipedream/types";

export const app: PipedreamAppModule;
export const addColumn: PipedreamActionModule;
export const addConditionalFormatRule: PipedreamActionModule;
export const addMultipleRows: PipedreamActionModule;
export const addProtectedRange: PipedreamActionModule;
export const addRows: PipedreamActionModule;
export const addSingleRow: PipedreamActionModule;
export const addWorksheet: PipedreamActionModule;
export const clearCell: PipedreamActionModule;
export const clearRows: PipedreamActionModule;
export const copyWorksheet: PipedreamActionModule;
export const createSpreadsheet: PipedreamActionModule;
export const createWorksheet: PipedreamActionModule;
export const deleteConditionalFormatRule: PipedreamActionModule;
export const deleteRows: PipedreamActionModule;
export const deleteWorksheet: PipedreamActionModule;
export const findRow: PipedreamActionModule;
export const findRows: PipedreamActionModule;
export const getCell: PipedreamActionModule;
export const getCurrentUser: PipedreamActionModule;
export const getSpreadsheetById: PipedreamActionModule;
export const getSpreadsheetInfo: PipedreamActionModule;
export const getValuesInRange: PipedreamActionModule;
export const insertAnchoredNote: PipedreamActionModule;
export const insertComment: PipedreamActionModule;
export const insertDimension: PipedreamActionModule;
export const listSpreadsheets: PipedreamActionModule;
export const listWorksheets: PipedreamActionModule;
export const mergeCells: PipedreamActionModule;
export const moveDimension: PipedreamActionModule;
export const newSpreadsheet: PipedreamActionModule;
export const readRows: PipedreamActionModule;
export const setDataValidation: PipedreamActionModule;
export const updateCell: PipedreamActionModule;
export const updateConditionalFormatRule: PipedreamActionModule;
export const updateFormatting: PipedreamActionModule;
export const updateMultipleRows: PipedreamActionModule;
export const updateRow: PipedreamActionModule;
export const updateRows: PipedreamActionModule;
export const upsertRow: PipedreamActionModule;
export const actions: PipedreamActionModule[];
