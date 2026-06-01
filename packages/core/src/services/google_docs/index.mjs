import app from "./google_docs.app.mjs";
import appendImage from "./actions/append-image/append-image.mjs";
import appendText from "./actions/append-text/append-text.mjs";
import createDocument from "./actions/create-document/create-document.mjs";
import createDocumentFromTemplate from "./actions/create-document-from-template/create-document-from-template.mjs";
import findDocument from "./actions/find-document/find-document.mjs";
import getDocument from "./actions/get-document/get-document.mjs";
import getTabContent from "./actions/get-tab-content/get-tab-content.mjs";
import insertPageBreak from "./actions/insert-page-break/insert-page-break.mjs";
import insertTable from "./actions/insert-table/insert-table.mjs";
import insertText from "./actions/insert-text/insert-text.mjs";
import replaceImage from "./actions/replace-image/replace-image.mjs";
import replaceText from "./actions/replace-text/replace-text.mjs";

export { app, appendImage, appendText, createDocument, createDocumentFromTemplate, findDocument, getDocument, getTabContent, insertPageBreak, insertTable, insertText, replaceImage, replaceText };
export const actions = [
  appendImage,
  appendText,
  createDocument,
  createDocumentFromTemplate,
  findDocument,
  getDocument,
  getTabContent,
  insertPageBreak,
  insertTable,
  insertText,
  replaceImage,
  replaceText,
];
