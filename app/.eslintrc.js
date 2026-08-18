module.exports = {
  root: true,
  extends: '@react-native',
  // Generated output -- linting it only produces noise about istanbul's
  // own bundled scripts.
  ignorePatterns: ['coverage/'],
  overrides: [
    {
      // Same typescript-eslint recommended ruleset the admin uses
      // (admin/eslint.config.mjs, via @electron-toolkit/eslint-config-ts),
      // layered on top of what @react-native/eslint-config already applies
      // to .ts/.tsx files.
      files: ['*.ts', '*.tsx'],
      extends: ['plugin:@typescript-eslint/recommended'],
    },
  ],
};
