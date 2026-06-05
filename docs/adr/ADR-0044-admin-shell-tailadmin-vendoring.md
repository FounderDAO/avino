# ADR-0044 — Admin shell: vendoring TailAdmin + Avino brand mapping

## Status

Accepted

## Date

2026-06-06

## Context

ADR-0043 lifted `apps/web` to Next 15 + React 19 + Tailwind v4 so that
TailAdmin (MIT) components could be vendored 1:1. `ADMIN-02` is the first task to
actually vendor TailAdmin: the admin **layout shell** (sidebar, header, content
container, dark-mode toggle) under a `(admin)` route group at `/admin/*`.

Two things needed deciding while vendoring:

1. **How TailAdmin's design vocabulary coexists with Avino's tokens.** TailAdmin
   components reference a `brand-*` / `gray-*` colour palette, `text-theme-*` /
   `text-title-*` sizes, `shadow-theme-*` shadows and `menu-*` utilities. None of
   these existed in Avino's `globals.css`, which only carries the Avino semantic
   tokens from ADR-0043 (`--color-bg-white`, `--color-text-primary`, …).
2. **The brand requirement** — the shell must look like Avino, not like the
   stock TailAdmin indigo template.

TailAdmin also ships its icons as an SVGR sprite (`@/icons`) which requires extra
webpack wiring, and its header bundles notification/user dropdown components that
are out of scope for a layout shell.

## Decision

- **TailAdmin support layer in `globals.css`.** A second `@theme` block plus
  `@utility` rules add exactly what the shell needs: the `brand`/`gray` scales,
  `text-theme-sm/xs`, `text-title-sm`, `shadow-theme-*` and the `menu-*` /
  `no-scrollbar` utilities. This is additive — all Avino tokens from ADR-0043 are
  untouched, and the two systems coexist (different token names). Further
  TailAdmin palettes (success/error/warning/…) are added as later admin pages
  need them, not pre-emptively.
- **Brand mapped to Avino.** The `brand-*` scale is re-anchored to Avino's blue:
  `brand-500` = action `#006AFF`, `brand-600` = primary `#0041D9`. Vendored
  TailAdmin components therefore render in Avino's brand without per-component
  edits. The neutral `gray-*` scale stays TailAdmin's own.
- **Self-contained icons.** TailAdmin's SVGR sprite is replaced by a small inline
  icon set at `src/icons/index.tsx` (same import path), so no SVGR build wiring
  is introduced.
- **Scope-trimmed header.** The header keeps the sidebar toggle, the
  command-search affordance and the theme toggle; TailAdmin's notification/user
  dropdowns are replaced with an Avino brand mark and a static user placeholder.
  Real logout lands in `ADMIN-06`.
- **Route group + providers.** `src/app/(admin)/admin/layout.tsx` wraps the shell
  in `ThemeProvider` + `SidebarProvider` (admin-scoped, not global) and renders
  `AdminShell`, which consumes the sidebar context to offset content.
- **Attribution.** `apps/web/NOTICE` carries the TailAdmin MIT notice and lists
  every vendored/adapted file.

## Consequences

Positive:

- The admin shell renders in Avino branding with light/dark mode; `/admin` is
  live as the foundation for `ADMIN-03+`.
- Future TailAdmin components drop in against the support layer with little or no
  porting; brand colours are controlled from one place.
- No SVGR/webpack additions; theme/sidebar contexts don't load on public pages.

Negative / trade-offs:

- Two colour vocabularies live in `globals.css` (Avino semantic tokens +
  TailAdmin palette); contributors must know which to reach for (admin → `brand`/
  `gray`; public site → Avino tokens).
- The support layer is intentionally partial — adding a TailAdmin component that
  uses an absent palette (e.g. `success-*`) requires extending `@theme` first.
- The header search and user block are visual placeholders until later tasks.

## Related files

- apps/web/src/app/globals.css
- apps/web/src/app/(admin)/admin/layout.tsx
- apps/web/src/app/(admin)/admin/page.tsx
- apps/web/src/layout/AppSidebar.tsx
- apps/web/src/layout/AppHeader.tsx
- apps/web/src/layout/AdminShell.tsx
- apps/web/src/layout/Backdrop.tsx
- apps/web/src/components/common/ThemeToggleButton.tsx
- apps/web/src/context/ThemeContext.tsx
- apps/web/src/context/SidebarContext.tsx
- apps/web/src/icons/index.tsx
- apps/web/NOTICE

## Related task

- ADMIN-02 (web admin panel — TailAdmin layout shell)
- Extends ADR-0043 (web foundation: Next 15 + Tailwind v4 + design tokens)
