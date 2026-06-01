import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../transports/pipedream/types";

export const app: PipedreamAppModule;
export const addComment: PipedreamActionModule;
export const addFileSharingPreference: PipedreamActionModule;
export const copyFile: PipedreamActionModule;
export const createFileFromTemplate: PipedreamActionModule;
export const createFileFromText: PipedreamActionModule;
export const createFolder: PipedreamActionModule;
export const createSharedDrive: PipedreamActionModule;
export const deleteComment: PipedreamActionModule;
export const deleteFile: PipedreamActionModule;
export const deleteReply: PipedreamActionModule;
export const deleteSharedDrive: PipedreamActionModule;
export const downloadFile: PipedreamActionModule;
export const findFile: PipedreamActionModule;
export const findFolder: PipedreamActionModule;
export const findForms: PipedreamActionModule;
export const findSpreadsheets: PipedreamActionModule;
export const getComment: PipedreamActionModule;
export const getCurrentUser: PipedreamActionModule;
export const getFileById: PipedreamActionModule;
export const getFolderIdForPath: PipedreamActionModule;
export const getReply: PipedreamActionModule;
export const getSharedDrive: PipedreamActionModule;
export const isFolderAncestor: PipedreamActionModule;
export const listAccessProposals: PipedreamActionModule;
export const listComments: PipedreamActionModule;
export const listFiles: PipedreamActionModule;
export const listMimeTypeOptions: PipedreamActionModule;
export const listReplies: PipedreamActionModule;
export const listThemeIdOptions: PipedreamActionModule;
export const moveFile: PipedreamActionModule;
export const moveFileToTrash: PipedreamActionModule;
export const removeFileSharingPermission: PipedreamActionModule;
export const replyToComment: PipedreamActionModule;
export const resolveAccessProposal: PipedreamActionModule;
export const resolveComment: PipedreamActionModule;
export const searchSharedDrives: PipedreamActionModule;
export const updateComment: PipedreamActionModule;
export const updateFile: PipedreamActionModule;
export const updateReply: PipedreamActionModule;
export const updateSharedDrive: PipedreamActionModule;
export const uploadFile: PipedreamActionModule;
export const actions: PipedreamActionModule[];
