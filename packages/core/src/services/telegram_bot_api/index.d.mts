import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../transports/pipedream/types";

export const app: PipedreamAppModule;
export const createChatInviteLink: PipedreamActionModule;
export const deleteMessage: PipedreamActionModule;
export const editMediaMessage: PipedreamActionModule;
export const editTextMessage: PipedreamActionModule;
export const exportChatInviteLink: PipedreamActionModule;
export const forwardMessage: PipedreamActionModule;
export const getNumMembersInChat: PipedreamActionModule;
export const kickChatMember: PipedreamActionModule;
export const listAdministratorsInChat: PipedreamActionModule;
export const listChats: PipedreamActionModule;
export const listCommandsOptions: PipedreamActionModule;
export const listUpdates: PipedreamActionModule;
export const pinMessage: PipedreamActionModule;
export const promoteChatMember: PipedreamActionModule;
export const restrictChatMember: PipedreamActionModule;
export const sendAlbum: PipedreamActionModule;
export const sendAudioFile: PipedreamActionModule;
export const sendDocumentOrImage: PipedreamActionModule;
export const sendMediaByUrlOrId: PipedreamActionModule;
export const sendPhoto: PipedreamActionModule;
export const sendSticker: PipedreamActionModule;
export const sendTextMessageOrReply: PipedreamActionModule;
export const sendVideo: PipedreamActionModule;
export const sendVideoNote: PipedreamActionModule;
export const sendVoiceMessage: PipedreamActionModule;
export const setChatPermissions: PipedreamActionModule;
export const unpinMessage: PipedreamActionModule;
export const actions: PipedreamActionModule[];
