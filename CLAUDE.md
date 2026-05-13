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
   - **Commit step by step, not as one giant commit.** Split the
     work into the smallest meaningful logical units (one concern
     per commit: schema change, then handler, then UI wiring, then
     tests, etc.) and commit each separately so the history is
     bisectable and reviewable. Do not squash unrelated changes
     into a single commit just because you finished them together.

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
- [ ] **Auto-merge once green.** If the PR is fully tested via the
      Chrome DevTools flow with no errors, and CI (type-check,
      `go test`, any other required checks) is passing, merge it
      into `jalur-yasril` yourself (`gh pr merge <num> --squash` or
      `--merge`, whichever matches the existing history) without
      waiting for the user to ask. Do **not** auto-merge if any
      check is red, the test pass was skipped, or a reviewer has
      requested changes — in that case, fix the issue and re-test
      before merging.
- [ ] After merge/abandon: `git worktree remove
      .claude/worktrees/<name>`.

## Dev deployment (parallel agents)

The public deployment at `https://gnrs.brkh.work` (loopback-bound app
behind the Cloudflare Tunnel; see `scripts/deploy.sh`) is the
**integration** environment for `jalur-yasril`. It is **not** where
in-progress feature branches get tested — multiple agents work in
parallel and would clobber each other.

For testing your own branch, deploy a **separate dev container** on
the remote host (`laode@10.8.0.13`) and expose it directly so Chrome
DevTools can drive it.

Rules:

- **Source = your worktree**, not the repo root and not
  `jalur-yasril`. Build and rsync from
  `.claude/worktrees/<name>/`, with the worktree checked out at the
  feature branch you are actively committing to. Run the deploy
  command from inside that worktree (`cd
  .claude/worktrees/<name> && …`) so the image baked on the remote
  contains the in-progress code, including uncommitted edits you
  want to smoke-test. Never point a dev deploy at the prod source
  tree or another agent's worktree.
- **Host**: same remote as prod (`10.8.0.13`). Different container
  name, image tag, data volume, and host port from prod and from
  every other running dev instance.
- **Bind externally**, not to loopback. Publish the host port on
  `10.8.0.13:<port>` (not `127.0.0.1:<port>`) so Chrome DevTools
  running off-host can reach it. No Cloudflare Tunnel for dev.
- **Port**: pick something that is **not** prod's `8080` and not in
  use by another dev instance. Check first
  (`ssh laode@10.8.0.13 'ss -tlnp | grep -E ":(80|81|82|83|90|91|92)[0-9][0-9]"'`
  or similar) and pick a free port in a high range (e.g.
  `18080`–`18999`). Record the port you chose in the PR description.
- **Namespacing**: derive the container name, image tag, project
  name, and data volume from your worktree's branch slug so two
  agents never collide. For branch `feat/<slug>`:
  - container: `ppg-dev-<slug>`
  - image: `ppg-dashboard-dev-<slug>:latest`
  - compose project: `ppg-dev-<slug>` (pass via `-p` /
    `COMPOSE_PROJECT_NAME`)
  - volume: `ppg-data-dev-<slug>` (separate from prod's `ppg-data`)
- **Cleanup**: when the PR is merged or abandoned, tear the dev
  stack down on the remote (`podman-compose -p ppg-dev-<slug> down
  -v` and remove the image) in the same step you remove the local
  worktree.

For the test flow itself (steps to drive through the UI, what to
capture for the PR), follow `TEST.md` — but substitute your dev URL
(`http://10.8.0.13:<port>`) for `https://gnrs.brkh.work`, and say so
in the "Tested via Chrome DevTools" section of the PR. If you cannot
reach `10.8.0.13:<port>` for the same reasons `TEST.md` calls out
for the public domain, say so explicitly instead of falling back to
`localhost`.

## What lives where

| Concern                            | File                                |
| ---------------------------------- | ----------------------------------- |
| Branch / PR / commit-message rules | [`RULES.md`](./RULES.md)            |
| Feature test procedure             | [`TEST.md`](./TEST.md)              |
| Stack, layout, env vars, API       | [`README.md`](./README.md)          |
| Database schema                    | [`docs/schema.md`](./docs/schema.md) |

When `RULES.md` or `TEST.md` conflict with assumptions baked into
your general training, the files in this repository win.
