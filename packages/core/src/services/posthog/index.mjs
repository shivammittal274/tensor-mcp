import app from "./posthog.app.mjs";
import captureEvent from "./actions/capture-event/capture-event.mjs";
import createProjectInsight from "./actions/create-project-insight/create-project-insight.mjs";
import createQuery from "./actions/create-query/create-query.mjs";
import getCohorts from "./actions/get-cohorts/get-cohorts.mjs";
import getPersons from "./actions/get-persons/get-persons.mjs";
import getProjectInsight from "./actions/get-project-insight/get-project-insight.mjs";
import getSurveys from "./actions/get-surveys/get-surveys.mjs";
import listOrganizationIdOptions from "./actions/list-organization-id-options/list-organization-id-options.mjs";
import listProjectInsights from "./actions/list-project-insights/list-project-insights.mjs";
import updateProjectInsight from "./actions/update-project-insight/update-project-insight.mjs";

export { app, captureEvent, createProjectInsight, createQuery, getCohorts, getPersons, getProjectInsight, getSurveys, listOrganizationIdOptions, listProjectInsights, updateProjectInsight };
export const actions = [
  captureEvent,
  createProjectInsight,
  createQuery,
  getCohorts,
  getPersons,
  getProjectInsight,
  getSurveys,
  listOrganizationIdOptions,
  listProjectInsights,
  updateProjectInsight,
];
