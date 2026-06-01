import app from "./supabase.app.mjs";
import batchInsertRows from "./actions/batch-insert-rows/batch-insert-rows.mjs";
import countRows from "./actions/count-rows/count-rows.mjs";
import deleteRow from "./actions/delete-row/delete-row.mjs";
import insertRow from "./actions/insert-row/insert-row.mjs";
import remoteProcedureCall from "./actions/remote-procedure-call/remote-procedure-call.mjs";
import selectRow from "./actions/select-row/select-row.mjs";
import updateRow from "./actions/update-row/update-row.mjs";
import upsertRow from "./actions/upsert-row/upsert-row.mjs";

export { app, batchInsertRows, countRows, deleteRow, insertRow, remoteProcedureCall, selectRow, updateRow, upsertRow };
export const actions = [
  batchInsertRows,
  countRows,
  deleteRow,
  insertRow,
  remoteProcedureCall,
  selectRow,
  updateRow,
  upsertRow,
];
