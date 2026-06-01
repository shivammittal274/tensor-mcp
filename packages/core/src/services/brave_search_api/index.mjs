import app from "./brave_search_api.app.mjs";
import webSearch from "./actions/web-search/web-search.mjs";

export { app, webSearch };
export const actions = [
  webSearch,
];
