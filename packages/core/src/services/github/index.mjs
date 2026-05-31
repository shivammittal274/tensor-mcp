import app from "./github.app.mjs";
import getCurrentUser from "./actions/get-current-user/get-current-user.mjs";
import listRepositories from "./actions/list-repositories/list-repositories.mjs";
import getRepository from "./actions/get-repository/get-repository.mjs";
import createIssue from "./actions/create-issue/create-issue.mjs";
import listCommits from "./actions/list-commits/list-commits.mjs";
import createIssueComment from "./actions/create-issue-comment/create-issue-comment.mjs";

export {
  app,
  getCurrentUser,
  listRepositories,
  getRepository,
  createIssue,
  listCommits,
  createIssueComment,
};
export const actions = [
  getCurrentUser,
  listRepositories,
  getRepository,
  createIssue,
  listCommits,
  createIssueComment,
];
