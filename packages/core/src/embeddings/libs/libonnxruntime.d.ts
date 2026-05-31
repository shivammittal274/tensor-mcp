// Bun `with { type: "file" }` imports yield a string path at runtime. None of
// the embedded artifacts (dylib, .onnx, .txt) have real TS types; this file
// declares the extensions we use so tsc doesn't complain.
declare module "*.dylib" {
  const path: string;
  export default path;
}
declare module "*.onnx" {
  const path: string;
  export default path;
}
declare module "*.txt" {
  const path: string;
  export default path;
}
