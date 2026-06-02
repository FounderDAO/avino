# DONE.md — Avino

Human-readable history of completed (merged) work.

Rules (see `docs/CLAUDE.md` → "Task tracking, DONE.md and ADR rules"):

- A task is added here **only after its PR is merged**.
- When a task is completed and merged, it is moved from `docs/TASKS.md` to this file.
- This log does **not** replace git history, Pull Requests, or ADR files.

Entry format:

```markdown
## YYYY-MM-DD

### TASK-XXX — Task title

Status: DONE
Branch: <branch-name>
PR: <PR link or PR number>

Files changed:
- <file-1>
- <file-2>

Summary:
- What was implemented
- Why it was needed
- Important notes

Commit messages:
- <commit message>

Related ADR:
- docs/adr/ADR-XXXX-short-title.md
```

---

## 2026-06-02

### TASK-DOCS-INIT — Initial project tracking documents (DONE.md + ADR)

Status: DONE
Branch: docs/initial-done-and-adr
PR: #12

Files changed:
- docs/DONE.md
- docs/adr/ADR-0001-project-stack.md
- docs/adr/ADR-0002-api-versioning-v1.md
- docs/adr/ADR-0003-postgis-prisma.md
- docs/adr/ADR-0004-vip-top-promotion-model.md

Summary:
- Initialized DONE.md as the human-readable log of merged work, with the entry format.
- Added 4 ADR records: project stack, API versioning v1, PostGIS via Prisma, VIP/TOP promotion model.
- Records existing decisions before coding starts — restates ARCHITECTURE.md §28, no architecture changed.

Commit messages:
- docs(adr): add initial architecture decisions

Related ADR:
- docs/adr/ADR-0001-project-stack.md
- docs/adr/ADR-0002-api-versioning-v1.md
- docs/adr/ADR-0003-postgis-prisma.md
- docs/adr/ADR-0004-vip-top-promotion-model.md

### TASK-010 — Initialize monorepo structure

Status: DONE
Branch: chore/monorepo-setup
PR: #14

Files changed:
- packages/config/package.json
- packages/config/tsconfig.base.json
- packages/config/prettier-preset.cjs
- packages/config/README.md
- packages/shared/package.json
- packages/shared/tsconfig.json
- pnpm-lock.yaml

Summary:
- Completed the M1 monorepo structure. The scaffold (apps/api, apps/web, packages/shared, root package.json, pnpm-workspace.yaml, docker-compose.yml, .env.example, .gitignore, README.md, docs/) already existed; the only acceptance-criteria gap was the missing packages/config package.
- Added @avino/config: a business-logic-free shared configuration package with a base tsconfig (tsconfig.base.json) and a Prettier preset (prettier-preset.cjs).
- Wired packages/shared to extend @avino/config/tsconfig.base.json and added @avino/config as a workspace:* devDependency, removing duplicated compiler options and proving the config package is consumed within the pnpm workspace.
- Verified: pnpm install links @avino/config; pnpm --filter @avino/shared build passes; prettier --check on new files passes. Note: apps/api lint failure (missing ESLint config) is pre-existing from the scaffold and out of scope.

Commit messages:
- chore(repo): add packages/config shared configuration package
- chore(shared): extend @avino/config base tsconfig

Related ADR:
- docs/adr/ADR-0001-project-stack.md (monorepo / pnpm / stack decision; mechanical structure completion, no new ADR required per TASKS.md Rule 4)
