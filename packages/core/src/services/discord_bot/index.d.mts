import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../transports/pipedream/types";

export const app: PipedreamAppModule;
export const addRole: PipedreamActionModule;
export const changeNickname: PipedreamActionModule;
export const createChannelInvite: PipedreamActionModule;
export const createGuildChannel: PipedreamActionModule;
export const deleteChannel: PipedreamActionModule;
export const deleteMessage: PipedreamActionModule;
export const findChannel: PipedreamActionModule;
export const findUser: PipedreamActionModule;
export const getMessage: PipedreamActionModule;
export const listChannelInvites: PipedreamActionModule;
export const listChannelMessages: PipedreamActionModule;
export const listChannels: PipedreamActionModule;
export const listGuildMembers: PipedreamActionModule;
export const listUsersWithEmojiReactions: PipedreamActionModule;
export const modifyChannel: PipedreamActionModule;
export const modifyGuildMember: PipedreamActionModule;
export const postReactionWithEmoji: PipedreamActionModule;
export const removeUserRole: PipedreamActionModule;
export const renameChannel: PipedreamActionModule;
export const sendMessage: PipedreamActionModule;
export const sendMessageToForumPost: PipedreamActionModule;
export const sendMessageWithFile: PipedreamActionModule;
export const actions: PipedreamActionModule[];
