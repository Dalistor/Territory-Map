module.exports = {
  root: true,
  extends: '@react-native',
  // Generated output -- linting it only produces noise about istanbul's
  // own bundled scripts.
  ignorePatterns: ['coverage/'],
  overrides: [
    {
      // Same typescript-eslint recommended ruleset the other two TypeScript
      // projects use (app/.eslintrc.js and admin/eslint.config.mjs), layered
      // on top of what @react-native/eslint-config already applies to
      // .ts/.tsx files.
      files: ['*.ts', '*.tsx'],
      extends: ['plugin:@typescript-eslint/recommended'],
    },
  ],
};
