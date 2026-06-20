'use strict';
const gtsConfig = require('gts');
const globals = require('globals');
const {defineConfig} = require('eslint/config');

// Google TypeScript Style (gts) for the app source. The build/test scripts are
// ESM `.mjs`; the config files are CommonJS `.cjs`. We give each the right module
// type and globals so `eslint .` can lint everything (gts's own CLI skips .mjs).
module.exports = defineConfig([
  {ignores: ['dist/', 'node_modules/']},
  ...gtsConfig,
  {
    // Build/test scripts run in Node, but the Puppeteer tests also reference
    // browser globals (document, window, File, ...) inside page.evaluate
    // callbacks that are lexically part of the file.
    files: ['scripts/**/*.mjs', 'test/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: {...globals.node, ...globals.browser},
    },
  },
  {
    // CommonJS config files (eslint.config.cjs, .prettierrc.cjs).
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {...globals.node},
    },
  },
]);
