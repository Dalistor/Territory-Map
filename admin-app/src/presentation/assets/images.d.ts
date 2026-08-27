// Lets image assets be imported with a regular `import` statement (the
// lint config forbids `require()`-style imports). Metro resolves the path
// to an asset reference at bundle time; `number` is the type React Native's
// `Image.source` expects for bundled assets.
declare module '*.png' {
  const asset: number;
  export default asset;
}
