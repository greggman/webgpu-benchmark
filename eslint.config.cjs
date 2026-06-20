'use strict';
const gtsConfig = require('gts');
const globals = require('globals');
const {defineConfig} = require('eslint/config');

// Google TypeScript Style (gts) for the app source, with Node globals enabled
// for the build/test scripts so they lint cleanly too.
module.exports = defineConfig([
  {ignores: ['dist/', 'node_modules/']},
  ...gtsConfig,
  {
    files: ['scripts/**/*.mjs', 'test/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: {...globals.node},
    },
  },
]);
