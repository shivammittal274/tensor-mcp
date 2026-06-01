import app from "./exa.app.mjs";
import answerQuestion from "./actions/answer-question/answer-question.mjs";
import findSimilarLinks from "./actions/find-similar-links/find-similar-links.mjs";
import getContents from "./actions/get-contents/get-contents.mjs";
import search from "./actions/search/search.mjs";

export { app, answerQuestion, findSimilarLinks, getContents, search };
export const actions = [
  answerQuestion,
  findSimilarLinks,
  getContents,
  search,
];
