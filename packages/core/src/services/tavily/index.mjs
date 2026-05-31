import app from "./tavily.app.mjs";
import sendQuery from "./actions/send-query/send-query.mjs";

export { app, sendQuery };
export const actions = [sendQuery];
