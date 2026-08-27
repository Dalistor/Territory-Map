module.exports = {
  preset: '@react-native/jest-preset',
  // `@react-navigation/*` ships ESM only (no CommonJS build -- its
  // `package.json` "exports" has no "require" condition), so the preset's
  // default `transformIgnorePatterns` (which only lets `react-native` itself
  // through) leaves its `export`/`import` syntax untranspiled and Jest fails
  // to parse it. Same setting `app/jest.config.js` carries, for the same
  // reason.
  transformIgnorePatterns: ['node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation)/)'],
  // Native modules replaced by mocks -- see jest.setup.js for why each one is
  // global rather than per-test.
  setupFiles: ['<rootDir>/jest.setup.js'],
};
