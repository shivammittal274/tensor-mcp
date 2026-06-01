import app from "./firecrawl.app.mjs";
import crawlUrl from "./actions/crawl-url/crawl-url.mjs";
import extractData from "./actions/extract-data/extract-data.mjs";
import getCrawlStatus from "./actions/get-crawl-status/get-crawl-status.mjs";
import getExtractStatus from "./actions/get-extract-status/get-extract-status.mjs";
import mapUrl from "./actions/map-url/map-url.mjs";
import scrapePage from "./actions/scrape-page/scrape-page.mjs";
import search from "./actions/search/search.mjs";

export { app, crawlUrl, extractData, getCrawlStatus, getExtractStatus, mapUrl, scrapePage, search };
export const actions = [
  crawlUrl,
  extractData,
  getCrawlStatus,
  getExtractStatus,
  mapUrl,
  scrapePage,
  search,
];
