import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "../../transports/pipedream/types";

export const app: PipedreamAppModule;
export const crawlUrl: PipedreamActionModule;
export const extractData: PipedreamActionModule;
export const getCrawlStatus: PipedreamActionModule;
export const getExtractStatus: PipedreamActionModule;
export const mapUrl: PipedreamActionModule;
export const scrapePage: PipedreamActionModule;
export const search: PipedreamActionModule;
export const actions: PipedreamActionModule[];
