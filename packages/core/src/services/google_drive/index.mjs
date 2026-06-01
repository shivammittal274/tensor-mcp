import app from "./google_drive.app.mjs";
import addComment from "./actions/add-comment/add-comment.mjs";
import addFileSharingPreference from "./actions/add-file-sharing-preference/add-file-sharing-preference.mjs";
import copyFile from "./actions/copy-file/copy-file.mjs";
import createFileFromTemplate from "./actions/create-file-from-template/create-file-from-template.mjs";
import createFileFromText from "./actions/create-file-from-text/create-file-from-text.mjs";
import createFolder from "./actions/create-folder/create-folder.mjs";
import createSharedDrive from "./actions/create-shared-drive/create-shared-drive.mjs";
import deleteComment from "./actions/delete-comment/delete-comment.mjs";
import deleteFile from "./actions/delete-file/delete-file.mjs";
import deleteReply from "./actions/delete-reply/delete-reply.mjs";
import deleteSharedDrive from "./actions/delete-shared-drive/delete-shared-drive.mjs";
import downloadFile from "./actions/download-file/download-file.mjs";
import findFile from "./actions/find-file/find-file.mjs";
import findFolder from "./actions/find-folder/find-folder.mjs";
import findForms from "./actions/find-forms/find-forms.mjs";
import findSpreadsheets from "./actions/find-spreadsheets/find-spreadsheets.mjs";
import getComment from "./actions/get-comment/get-comment.mjs";
import getCurrentUser from "./actions/get-current-user/get-current-user.mjs";
import getFileById from "./actions/get-file-by-id/get-file-by-id.mjs";
import getFolderIdForPath from "./actions/get-folder-id-for-path/get-folder-id-for-path.mjs";
import getReply from "./actions/get-reply/get-reply.mjs";
import getSharedDrive from "./actions/get-shared-drive/get-shared-drive.mjs";
import isFolderAncestor from "./actions/is-folder-ancestor/is-folder-ancestor.mjs";
import listAccessProposals from "./actions/list-access-proposals/list-access-proposals.mjs";
import listComments from "./actions/list-comments/list-comments.mjs";
import listFiles from "./actions/list-files/list-files.mjs";
import listMimeTypeOptions from "./actions/list-mime-type-options/list-mime-type-options.mjs";
import listReplies from "./actions/list-replies/list-replies.mjs";
import listThemeIdOptions from "./actions/list-theme-id-options/list-theme-id-options.mjs";
import moveFile from "./actions/move-file/move-file.mjs";
import moveFileToTrash from "./actions/move-file-to-trash/move-file-to-trash.mjs";
import removeFileSharingPermission from "./actions/remove-file-sharing-permission/remove-file-sharing-permission.mjs";
import replyToComment from "./actions/reply-to-comment/reply-to-comment.mjs";
import resolveAccessProposal from "./actions/resolve-access-proposal/resolve-access-proposal.mjs";
import resolveComment from "./actions/resolve-comment/resolve-comment.mjs";
import searchSharedDrives from "./actions/search-shared-drives/search-shared-drives.mjs";
import updateComment from "./actions/update-comment/update-comment.mjs";
import updateFile from "./actions/update-file/update-file.mjs";
import updateReply from "./actions/update-reply/update-reply.mjs";
import updateSharedDrive from "./actions/update-shared-drive/update-shared-drive.mjs";
import uploadFile from "./actions/upload-file/upload-file.mjs";

export { app, addComment, addFileSharingPreference, copyFile, createFileFromTemplate, createFileFromText, createFolder, createSharedDrive, deleteComment, deleteFile, deleteReply, deleteSharedDrive, downloadFile, findFile, findFolder, findForms, findSpreadsheets, getComment, getCurrentUser, getFileById, getFolderIdForPath, getReply, getSharedDrive, isFolderAncestor, listAccessProposals, listComments, listFiles, listMimeTypeOptions, listReplies, listThemeIdOptions, moveFile, moveFileToTrash, removeFileSharingPermission, replyToComment, resolveAccessProposal, resolveComment, searchSharedDrives, updateComment, updateFile, updateReply, updateSharedDrive, uploadFile };
export const actions = [
  addComment,
  addFileSharingPreference,
  copyFile,
  createFileFromTemplate,
  createFileFromText,
  createFolder,
  createSharedDrive,
  deleteComment,
  deleteFile,
  deleteReply,
  deleteSharedDrive,
  downloadFile,
  findFile,
  findFolder,
  findForms,
  findSpreadsheets,
  getComment,
  getCurrentUser,
  getFileById,
  getFolderIdForPath,
  getReply,
  getSharedDrive,
  isFolderAncestor,
  listAccessProposals,
  listComments,
  listFiles,
  listMimeTypeOptions,
  listReplies,
  listThemeIdOptions,
  moveFile,
  moveFileToTrash,
  removeFileSharingPermission,
  replyToComment,
  resolveAccessProposal,
  resolveComment,
  searchSharedDrives,
  updateComment,
  updateFile,
  updateReply,
  updateSharedDrive,
  uploadFile,
];
