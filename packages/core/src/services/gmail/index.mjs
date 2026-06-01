import app from "./gmail.app.mjs";
import addLabelToEmail from "./actions/add-label-to-email/add-label-to-email.mjs";
import approveWorkflow from "./actions/approve-workflow/approve-workflow.mjs";
import archiveEmail from "./actions/archive-email/archive-email.mjs";
import bulkArchiveEmails from "./actions/bulk-archive-emails/bulk-archive-emails.mjs";
import createDraft from "./actions/create-draft/create-draft.mjs";
import createLabel from "./actions/create-label/create-label.mjs";
import deleteEmail from "./actions/delete-email/delete-email.mjs";
import downloadAttachment from "./actions/download-attachment/download-attachment.mjs";
import findEmail from "./actions/find-email/find-email.mjs";
import getCurrentUser from "./actions/get-current-user/get-current-user.mjs";
import getSendAsAlias from "./actions/get-send-as-alias/get-send-as-alias.mjs";
import listDelegateOptions from "./actions/list-delegate-options/list-delegate-options.mjs";
import listLabels from "./actions/list-labels/list-labels.mjs";
import listSendAsAliases from "./actions/list-send-as-aliases/list-send-as-aliases.mjs";
import listSignatureOptions from "./actions/list-signature-options/list-signature-options.mjs";
import listThreadMessages from "./actions/list-thread-messages/list-thread-messages.mjs";
import removeLabelFromEmail from "./actions/remove-label-from-email/remove-label-from-email.mjs";
import sendEmail from "./actions/send-email/send-email.mjs";
import updatePrimarySignature from "./actions/update-primary-signature/update-primary-signature.mjs";

export { app, addLabelToEmail, approveWorkflow, archiveEmail, bulkArchiveEmails, createDraft, createLabel, deleteEmail, downloadAttachment, findEmail, getCurrentUser, getSendAsAlias, listDelegateOptions, listLabels, listSendAsAliases, listSignatureOptions, listThreadMessages, removeLabelFromEmail, sendEmail, updatePrimarySignature };
export const actions = [
  addLabelToEmail,
  approveWorkflow,
  archiveEmail,
  bulkArchiveEmails,
  createDraft,
  createLabel,
  deleteEmail,
  downloadAttachment,
  findEmail,
  getCurrentUser,
  getSendAsAlias,
  listDelegateOptions,
  listLabels,
  listSendAsAliases,
  listSignatureOptions,
  listThreadMessages,
  removeLabelFromEmail,
  sendEmail,
  updatePrimarySignature,
];
