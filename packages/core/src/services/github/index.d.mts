import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../transports/pipedream/types";

export const app: PipedreamAppModule;
export const createBranch: PipedreamActionModule;
export const createGist: PipedreamActionModule;
export const createIssue: PipedreamActionModule;
export const createIssueComment: PipedreamActionModule;
export const createOrUpdateFileContents: PipedreamActionModule;
export const createPullRequest: PipedreamActionModule;
export const createRepository: PipedreamActionModule;
export const createWorkflowDispatch: PipedreamActionModule;
export const disableWorkflow: PipedreamActionModule;
export const enableWorkflow: PipedreamActionModule;
export const getCommit: PipedreamActionModule;
export const getCurrentUser: PipedreamActionModule;
export const getIssue: PipedreamActionModule;
export const getIssueAssignees: PipedreamActionModule;
export const getRepository: PipedreamActionModule;
export const getRepositoryContent: PipedreamActionModule;
export const getReviewers: PipedreamActionModule;
export const getWorkflowRun: PipedreamActionModule;
export const listBranches: PipedreamActionModule;
export const listCommits: PipedreamActionModule;
export const listGistIdOptions: PipedreamActionModule;
export const listGistsForAUser: PipedreamActionModule;
export const listOrgNameOptions: PipedreamActionModule;
export const listOrganizationRepositories: PipedreamActionModule;
export const listOrganizations: PipedreamActionModule;
export const listReleases: PipedreamActionModule;
export const listRepositories: PipedreamActionModule;
export const listTeamIdOptions: PipedreamActionModule;
export const listWorkflowRuns: PipedreamActionModule;
export const searchIssuesAndPullRequests: PipedreamActionModule;
export const starRepo: PipedreamActionModule;
export const syncForkBranchWithUpstream: PipedreamActionModule;
export const updateGist: PipedreamActionModule;
export const updateIssue: PipedreamActionModule;
export const updateProjectV2ItemStatus: PipedreamActionModule;
export const updatePullRequest: PipedreamActionModule;
export const actions: PipedreamActionModule[];
