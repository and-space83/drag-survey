'use strict';
// The same distribution set is used by capture, build and public verification.
module.exports = Object.freeze(require('../lib/app-source.cjs').appAssetPaths(require('node:path').resolve(process.env.APP_ROOT || require('node:path').join(__dirname, '..'))));
