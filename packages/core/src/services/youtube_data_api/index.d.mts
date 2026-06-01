import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../transports/pipedream/types";

export const app: PipedreamAppModule;
export const addPlaylistItems: PipedreamActionModule;
export const channelStatistics: PipedreamActionModule;
export const createCommentThread: PipedreamActionModule;
export const createPlaylist: PipedreamActionModule;
export const deletePlaylist: PipedreamActionModule;
export const deletePlaylistItems: PipedreamActionModule;
export const listActivities: PipedreamActionModule;
export const listLanguageOptions: PipedreamActionModule;
export const listPlaylistVideos: PipedreamActionModule;
export const listPlaylists: PipedreamActionModule;
export const listVideos: PipedreamActionModule;
export const replyToComment: PipedreamActionModule;
export const searchVideos: PipedreamActionModule;
export const updateChannel: PipedreamActionModule;
export const updatePlaylist: PipedreamActionModule;
export const updateVideoDetails: PipedreamActionModule;
export const uploadChannelBanner: PipedreamActionModule;
export const uploadThumbnail: PipedreamActionModule;
export const uploadVideo: PipedreamActionModule;
export const actions: PipedreamActionModule[];
