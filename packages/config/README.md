# @avino/config

Shared build and tooling configuration for the Avino monorepo. No business logic
lives here — only configuration that other workspace packages extend so settings
stay defined in one place.

## Contents

- `tsconfig.base.json` — base TypeScript compiler options shared by apps and packages.
- `prettier-preset.cjs` — shared Prettier rules, mirroring the root `.prettierrc.json`.

## Usage

### TypeScript

In a package `tsconfig.json`:

```jsonc
{
  "extends": "@avino/config/tsconfig.base.json",
  "compilerOptions": {
    // package-specific overrides (module, jsx, outDir, ...)
  },
  "include": ["src"]
}
```

Add the dependency to that package:

```jsonc
{
  "devDependencies": {
    "@avino/config": "workspace:*"
  }
}
```

### Prettier

```js
// prettier.config.cjs
module.exports = require('@avino/config/prettier-preset');
```
