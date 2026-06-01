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

_No completed tasks recorded yet. The first entry (initial DONE.md + ADR records) is added here after its PR is merged._
