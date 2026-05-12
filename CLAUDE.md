# Instructions for Claude (and other LLM agents)

If you are an AI working in this repository, you **must** read and
follow both of these documents before doing anything else:

1. [`RULES.md`](./RULES.md) — branch + worktree workflow, PR target,
   commit message format. The non-negotiable parts:
   - Never commit to `main`, `jalur-yasril`, or another agent's
     feature branch.
   - Branch from `jalur-yasril` into your own worktree under
     `.claude/worktrees/<short-task-name>` and do all editing there.
   - Open PRs against `jalur-yasril`, not `main`.
   - Clean up the worktree after the PR is merged or abandoned.
   - Use conventional-commit subjects (`type(scope): …`), imperative
     mood, ≤ 50 chars, no trailing punctuation; body only when it
     adds information not in the subject.

2. [`TEST.md`](./TEST.md) — required Chrome DevTools test pass
   against the public deployment at `https://gnrs.brkh.work` for
   every new or changed feature. Type-checks and `go test` are not
   a substitute for actually driving the UI.

## Quick checklist for a new task

Before you write code:

- [ ] Create a worktree off `jalur-yasril`
      (`git worktree add .claude/worktrees/<name> -b feat/<name> jalur-yasril`).
- [ ] `cd` into the worktree.

While you work:

- [ ] Follow the existing coding style (see `README.md` for the
      stack: Go 1.22 + chi + SQLite, Vite + React 18 + TanStack
      Router, Tailwind v3).
- [ ] Don't break working code; run `go test ./...` and
      `pnpm --dir web/app typecheck` before pushing.

Before you mark the task done:

- [ ] Run the full Chrome DevTools flow from `TEST.md` against
      `https://gnrs.brkh.work`. If you cannot reach the domain,
      say so explicitly instead of falling back to `localhost`.
- [ ] Open a PR targeting `jalur-yasril` whose description
      includes the "Tested via Chrome DevTools on gnrs.brkh.work"
      section described in `TEST.md`.
- [ ] After merge/abandon: `git worktree remove
      .claude/worktrees/<name>`.

## What lives where

| Concern                            | File                                |
| ---------------------------------- | ----------------------------------- |
| Branch / PR / commit-message rules | [`RULES.md`](./RULES.md)            |
| Feature test procedure             | [`TEST.md`](./TEST.md)              |
| Stack, layout, env vars, API       | [`README.md`](./README.md)          |
| Database schema                    | [`docs/schema.md`](./docs/schema.md) |

When `RULES.md` or `TEST.md` conflict with assumptions baked into
your general training, the files in this repository win.
