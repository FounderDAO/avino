# ADR-0043 — Web foundation: Next 15 + React 19 + Tailwind v4 + design tokens

## Status

Accepted

## Date

2026-06-06

## Context

The Avino web app (`apps/web/`) is being grown into an owner/admin panel
(tracker `docs/TASK_ADMIN_PANEL.md`, tasks `ADMIN-01..17`). The chosen UI base
is **TailAdmin (MIT)**, whose components are authored for **Next 15 + React 19 +
Tailwind v4**. Until now `apps/web` ran on **Next 14 + React 18** with no styling
layer (no Tailwind, no design tokens).

To vendor TailAdmin components 1:1 and to give every later admin task a single,
consistent styling foundation, the stack must be lifted to match, and the Avino
design tokens (`docs/AvinoWebPlan.md` §3) must exist as the source of truth for
colors, radii, typography and spacing.

This decision concerns only the **web client's build/styling foundation**. It
does not touch the API, the data layer (RTK Query stays the only API access
path, per CLAUDE.md §4), auth, or business logic — so it does not require Team
Lead sign-off beyond the already-fixed decisions in the admin tracker §0.

## Decision

`apps/web` is upgraded and given a design-token styling layer:

- **Runtime/versions:** `next@^15`, `react@^19`, `react-dom@^19`,
  `@types/react@^19`, `@types/react-dom@^19`, `eslint-config-next@^15`.
  `@reduxjs/toolkit` (`^2.5`) and `react-redux` (`^9.2`) are bumped to versions
  with explicit React 19 support. `StoreProvider` is adjusted for the React 19
  `useRef` typing (`useRef<AppStore | null>(null)`).
- **Tailwind v4** (`tailwindcss@^4`, `@tailwindcss/postcss@^4`, `postcss`) wired
  via `postcss.config.mjs` and `src/app/globals.css` (`@import "tailwindcss"`).
- **Design tokens** from `AvinoWebPlan.md` §3 are declared in the Tailwind v4
  `@theme` block (colors, radii, typography, base font), so they emit both CSS
  variables (`var(--color-*)`) and utilities (`bg-primary`, `text-h1`,
  `rounded-pill`, …). Spacing scale and component dimensions that do not map to a
  Tailwind namespace are kept as plain `:root` custom properties.
- **Dark mode = class strategy**: `@custom-variant dark (&:where(.dark, .dark *))`,
  with a `.dark` block overriding semantic surface/text tokens.
- **Base font: Inter** (latin + cyrillic) loaded via `next/font/google`, exposed
  through `--font-inter` and consumed by the `--font-ui` token.

## Consequences

Positive:

- TailAdmin components can be vendored without per-component porting (ADMIN-02+).
- One token source of truth; brand colors are placeholders to be re-tuned for
  Avino without touching component code.
- Class-based dark mode and Inter are ready for the admin shell.

Negative / trade-offs:

- Tailwind v4 is CSS-first (`@theme`), a different mental model from v3 configs.
- `next lint` is deprecated in Next 15 (removed in 16); a future migration to the
  ESLint CLI will be needed (tracked separately, not blocking).
- Brand tokens are placeholders, not the final Avino palette.

## Related files

- apps/web/package.json
- apps/web/postcss.config.mjs
- apps/web/.eslintrc.json
- apps/web/src/app/globals.css
- apps/web/src/app/layout.tsx
- apps/web/src/app/page.tsx
- apps/web/src/store/StoreProvider.tsx
- docs/AvinoWebPlan.md (§3)
- docs/TASK_ADMIN_PANEL.md (ADMIN-01, §0)

## Related task

- ADMIN-01 (web admin panel — stack + Tailwind v4 + design tokens)
