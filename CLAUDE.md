# Instructions for Claude (and other LLM agents)

If you are an AI working in this repository, you **must** read and
follow both of these documents before doing anything else:

1. [`RULES.md`](./RULES.md) — branch + worktree workflow, PR target,
   commit message format. The non-negotiable parts:
   - Never commit to `main`, `jalur-yasril`, or another agent's
     feature branch.
   - Branch from `jalur-yasril` into your own worktree under
     `.claude/worktrees/<short-task-name>` and do all editing there.
   - Open PRs against `jalur-yasril`, not `main` (see
     [`RELEASE.md`](./RELEASE.md) for the one sanctioned exception:
     promoting a release snapshot to `main`).
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

## Per-session lifecycle (mandatory loop)

Every LLM session that touches the code **must** run the full loop
below, in this order, end-to-end — no skipping steps, no parking a
feature half-done for a future session:

1. **Worktree** — create `.claude/worktrees/<name>` off
   `jalur-yasril` on a fresh `feat/<name>` branch, and `cd` into it.
   All editing happens inside that worktree.
2. **Step-by-step commits** — split the work into the smallest
   meaningful logical units and commit each one separately with a
   conventional-commit subject. Do not batch unrelated changes
   into one mega-commit.
3. **Test** — run `go test ./...` and
   `pnpm --dir web/app typecheck`, then the full Chrome DevTools
   flow from `TEST.md` against your dev deployment (or
   `https://gnrs.brkh.work` if it's appropriate for the change).
   If the UI test pass is impossible, say so explicitly in the PR
   — do not silently skip it.
4. **PR** — push the branch and open a PR targeting `jalur-yasril`
   (never `main` — unless you are explicitly running the release
   promotion in [`RELEASE.md`](./RELEASE.md), which is the only
   sanctioned `--base main` flow) with the "Tested via Chrome
   DevTools" section filled in.
5. **Merge** — once CI is green and the test pass has no errors,
   auto-merge with `gh pr merge <num> --squash --delete-branch`
   (or `--merge --delete-branch`, matching repo history). **If
   the PR has merge conflicts with `jalur-yasril`, resolve them
   in the worktree** (`git fetch origin && git merge
   origin/jalur-yasril`, fix the conflicts, re-run tests, push
   the resolution, wait for CI to go green again, then merge).
   Do not leave a conflicting PR sitting open for another session
   to deal with.
6. **Deploy to prod** — once the PR is merged into
   `jalur-yasril` with no problems (CI green on the integration
   branch, no follow-up conflicts pending), deploy the
   freshly-merged `jalur-yasril` to production. From the **main
   checkout** (not your now-stale worktree), fast-forward to the
   merged tip and run `scripts/deploy.sh`:

       cd <repo root>            # not .claude/worktrees/<name>
       git checkout jalur-yasril
       git pull --ff-only origin jalur-yasril
       scripts/deploy.sh

   Watch the container logs the script tails at the end and
   confirm `https://gnrs.brkh.work` is serving the new build
   (login page loads, no 5xx, the feature you just merged is
   visible). Do **not** deploy if the merge had to be redone for
   conflicts and tests haven't been re-run on the merged result,
   or if another agent's merge landed on `jalur-yasril` between
   your CI run and the deploy without you re-pulling — pull
   again and re-verify first.
7. **Clean up** — immediately after the prod deploy is healthy
   (or after deciding to abandon the PR), remove the worktree,
   delete the local and remote feature branches, prune stale
   tracking refs, and tear down the dev deployment. See the
   cleanup checklist below for the exact commands. A session is
   **not finished** until the worktree directory is gone and the
   branch refs are gone.

If the session ends before the loop completes (context limit,
user interrupts, etc.), state in plain text which step you're on
and what's left, so the next session can pick up from there
without re-deriving the state.

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
      into `jalur-yasril` yourself (`gh pr merge <num> --squash
      --delete-branch` or `--merge --delete-branch`, whichever
      matches the existing history) without waiting for the user
      to ask. Always pass `--delete-branch` so the remote feature
      branch is removed as part of the merge. **If GitHub reports
      merge conflicts**, resolve them in your worktree
      (`git fetch origin && git merge origin/jalur-yasril`, fix
      the conflicts commit-by-commit, re-run `go test ./...`,
      `pnpm --dir web/app typecheck`, and the relevant parts of
      the Chrome DevTools flow, then push the resolution); wait
      for CI to go green again before merging. Do **not**
      auto-merge if any check is red, the test pass was skipped,
      conflicts are unresolved, or a reviewer has requested
      changes — fix the issue and re-test before merging.
- [ ] **Deploy to prod once the merge is clean.** As soon as the
      PR is merged into `jalur-yasril` with no problems (CI green
      on the integration branch, no unresolved conflicts), ship
      the merged `jalur-yasril` to production from the **main
      checkout**:

          cd <repo root>            # not .claude/worktrees/<name>
          git checkout jalur-yasril
          git pull --ff-only origin jalur-yasril
          scripts/deploy.sh

      Then confirm `https://gnrs.brkh.work` is serving the new
      build (login page loads, no 5xx, the feature you just
      merged is visible in the UI). Do **not** deploy if you
      had to redo the merge for conflicts and haven't re-run the
      test pass on the merged result, if a parallel agent's
      merge landed between your CI run and your deploy (pull
      again and re-verify first), or if the prod deploy's
      container logs show errors — in that case roll back to the
      previous `jalur-yasril` tip (`git reset --hard <prev sha> &&
      scripts/deploy.sh`) and investigate before continuing.
- [ ] **Clean up immediately after deploy/abandon — do not let
      merged branches or worktrees linger.** As soon as the prod
      deploy is healthy (or you decide to abandon the PR), run
      all of the following before moving on to the next task or
      ending the session:
      1. **Remove the worktree.** `cd` out of
         `.claude/worktrees/<name>` first (e.g. back to the repo
         root), then `git worktree remove
         .claude/worktrees/<name>`. Use `--force` only if the
         worktree is intentionally dirty and you have already
         saved anything worth keeping. Confirm with `git worktree
         list` that the entry is gone and that the directory
         under `.claude/worktrees/` no longer exists.
      2. `git branch -D feat/<name>` from the main checkout to
         delete the local feature branch.
      3. If the remote branch still exists (it usually won't after
         `gh pr merge --delete-branch`, but verify with
         `git ls-remote --heads origin feat/<name>`), delete it
         with `git push origin --delete feat/<name>`.
      4. `git fetch --prune origin` so stale remote-tracking refs
         (`origin/feat/<name>`) are dropped locally too.
      5. Tear down this branch's dev deployment on the remote (see
         the "Cleanup" bullet under *Dev deployment* below).
      A merged branch that still has a worktree directory, a
      worktree-list entry, a local ref, a remote ref, or a
      running dev container counts as **not cleaned up** — finish
      all five before starting new work or closing the session.
      Before opening a new feature, run `git worktree list` and
      confirm there are no leftover entries from already-merged
      branches; if there are, clean them up first.

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
- **Namespacing**: derive the pod, container, image, and volume
  names from your worktree's branch slug so two agents never
  collide. For branch `feat/<slug>`, pass these to
  `scripts/deploy.sh`:
  - pod:       `ppg-dev-<slug>`
  - app ct:    `ppg-dev-<slug>-app` (default `${POD_NAME}-app`)
  - tunnel ct: `ppg-dev-<slug>-cloudflared` (only spawned if
    `CLOUDFLARE_TUNNEL_TOKEN` is set in the remote `.env` — leave it
    empty for dev pods)
  - image:     `ppg-dashboard-dev-<slug>:latest`
  - volume:    `ppg-data-dev-<slug>` (separate from prod's
    `ppg_ppg-data`)
  - remote dir: `/home/laode/ppg-dev-<slug>` (separate from prod's
    `/home/laode/ppg`)

  Typical invocation from inside your worktree:

      POD_NAME=ppg-dev-<slug> \
      VOLUME_NAME=ppg-data-dev-<slug> \
      IMAGE_TAG=ppg-dashboard-dev-<slug>:latest \
      REMOTE_DIR=/home/laode/ppg-dev-<slug> \
      PORT=<your-port> \
      HOST_BIND_IP=10.8.0.13 \
      scripts/deploy.sh

- **Cleanup**: when the PR is merged or abandoned, tear the dev
  pod down on the remote in the same step you remove the local
  worktree:

      ssh laode@10.8.0.13 '
        podman pod rm -f ppg-dev-<slug> || true
        podman volume rm ppg-data-dev-<slug> || true
        podman rmi ppg-dashboard-dev-<slug>:latest || true
        rm -rf /home/laode/ppg-dev-<slug>
      '

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
| Promotion / PR to `main` workflow  | [`RELEASE.md`](./RELEASE.md)        |
| Stack, layout, env vars, API       | [`README.md`](./README.md)          |
| Database schema                    | [`docs/schema.md`](./docs/schema.md) |

When `RULES.md` or `TEST.md` conflict with assumptions baked into
your general training, the files in this repository win.
