module.exports = {
  preset: '@react-native/jest-preset',
  // `@react-navigation/*` ships ESM only (no CommonJS build -- its
  // `package.json` "exports" has no "require" condition), so the preset's
  // default `transformIgnorePatterns` (which only lets `react-native` itself
  // through) leaves its `export`/`import` syntax untranspiled and Jest fails
  // to parse it. Added for Task 26 (spec 0005), the first App code to import
  // `@react-navigation/*`.
  transformIgnorePatterns: ['node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation)/)'],
  // Replaces react-native-safe-area-context with its official Jest mock --
  // see jest.setup.js for why it is global.
  setupFiles: ['<rootDir>/jest.setup.js'],
};
