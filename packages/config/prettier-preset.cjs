// Shared Prettier preset for the Avino monorepo.
// Mirrors the root .prettierrc.json so individual packages can opt in via:
//   module.exports = require('@avino/config/prettier-preset');
/** @type {import('prettier').Config} */
module.exports = {
  singleQuote: true,
  trailingComma: 'all',
  semi: true,
  printWidth: 80,
};
