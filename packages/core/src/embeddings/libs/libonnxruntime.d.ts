// Bun `with { type: "file" }` imports yield a string path at runtime. The
// .dylib has no real declaration; this tells TS to type the default export
// as the string path Bun produces.
declare module "*.dylib" {
  const path: string;
  export default path;
}
