import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../transports/pipedream/types";

export const app: PipedreamAppModule;
export const addLabelToEmail: PipedreamActionModule;
export const approveWorkflow: PipedreamActionModule;
export const archiveEmail: PipedreamActionModule;
export const bulkArchiveEmails: PipedreamActionModule;
export const createDraft: PipedreamActionModule;
export const createLabel: PipedreamActionModule;
export const deleteEmail: PipedreamActionModule;
export const downloadAttachment: PipedreamActionModule;
export const findEmail: PipedreamActionModule;
export const getCurrentUser: PipedreamActionModule;
export const getSendAsAlias: PipedreamActionModule;
export const listDelegateOptions: PipedreamActionModule;
export const listLabels: PipedreamActionModule;
export const listSendAsAliases: PipedreamActionModule;
export const listSignatureOptions: PipedreamActionModule;
export const listThreadMessages: PipedreamActionModule;
export const removeLabelFromEmail: PipedreamActionModule;
export const sendEmail: PipedreamActionModule;
export const updatePrimarySignature: PipedreamActionModule;
export const actions: PipedreamActionModule[];
