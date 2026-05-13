# Promotion to `main` — the release workflow

> **TL;DR for the LLM agent.** Every other workflow in this repo
> targets `jalur-yasril`. **This** workflow is the *only* time you
> are allowed to open a PR against `main`. Do not invoke it unless
> the user has explicitly asked for it (see §1).

## 1. When to use this doc

Use this workflow **only** when the user explicitly asks to:

- "PR to `main`"
- "release to `main`"
- "promote `jalur-yasril` to `main`"
- or any obvious paraphrase of the above.

For everything else — feature work, bug fixes, docs, refactors —
follow `CLAUDE.md` and target `jalur-yasril`. Do **not** open a PR
to `main` on your own initiative just because a change "feels
release-shaped".

## 2. The transition-branch concept

`main` never receives `jalur-yasril` directly. The integration
branch *is* the production environment for `gnrs.brkh.work`: it
carries the podman-compose stack, the Cloudflare-tunnel sidecar
wiring, and the push-to-prod helper that drives them. Those
artefacts are tightly coupled to **our** specific deployment
topology — they have no business on a forked snapshot.

A release snapshot on `main` should instead read as
**deploy-anywhere**: just the application source plus a generic
container surface (Dockerfile, a `docker-run` Makefile target,
and an `.env.example` without our tunnel knob). Someone forking
the repo can build the image and run it under whatever
orchestration they prefer, without inheriting our podman-compose
layout, our `10.8.0.13` host, or our Cloudflare tunnel.

To bridge that, you cut a short-lived **transition branch**
(`release/<slug>`) off `jalur-yasril`, apply the cleanup
checklist (§4) on the transition branch only, and PR *that*
into `main`. `jalur-yasril` keeps the full prod orchestration;
`main` becomes the portable snapshot.

The transition branch is single-use. After the PR merges (or is
abandoned), the branch is deleted and the next release cuts a
fresh one.

## 3. Step-by-step workflow

1. **Pull `jalur-yasril` first**, then cut the worktree:

       cd <repo root>
       git checkout jalur-yasril
       git pull --ff-only origin jalur-yasril
       git worktree add .claude/worktrees/release-<slug> \
         -b release/<slug> jalur-yasril
       cd .claude/worktrees/release-<slug>

   Pick `<slug>` so it is descriptive of the release window
   (e.g. `release/2026-05-13` or `release/q2-cleanup`). Slug
   only — no spaces, no slashes beyond the `release/` prefix.

2. **Apply the cleanup checklist in §4.** Touch only the files
   listed there. Do not pull in unrelated edits.

3. **Commit step-by-step**, one concern per commit, per `RULES.md`.
   Example sequence:

       chore(release): drop docker-compose.yml from main
       chore(release): drop scripts/deploy.sh from main
       chore(env): drop CLOUDFLARE_TUNNEL_TOKEN from example
       chore(make): parameterize data volume via DATA_VOLUME
       docs: strip prod-host references for main release

   Conventional-commit subjects, imperative mood, ≤ 50 chars, no
   trailing punctuation.

4. **Test**:

       go test ./...
       pnpm --dir web/app typecheck

   A Chrome DevTools UI test pass via `TEST.md` is **not** required
   for a release PR — the cleanup deletes orchestration files and
   genericizes docs, not runtime code. State this explicitly in the
   PR description (the template in §5 already does).

5. **Verification grep** — before opening the PR, from inside the
   worktree:

       git grep -nE 'gnrs\.brkh\.work|10\.8\.0\.13|laode@|/home/laode/ppg|ppg-data\b|cloudflared|CLOUDFLARE_TUNNEL|podman-compose|docker-compose'

   Expect zero hits **outside `RELEASE.md` itself** (this doc names
   those strings as cleanup targets, so it will match). Paste the
   result into the PR's "Verification grep" block.

6. **Open the PR against `main`**:

       gh pr create --base main \
         --title 'release: deploy-anywhere snapshot (<slug>)' \
         --body "$(cat <<'EOF'
       <fill in the template from §5>
       EOF
       )"

   The PR title and body should describe *the changes themselves*
   — what's added, removed, or genericized — not the
   integration-branch plumbing that produced them. Keep
   `jalur-yasril` out of the user-facing PR text; the template in
   §5 is already worded that way.

   This is the only sanctioned `--base main` PR in the repo's
   workflow. Every other PR still targets the integration branch.

7. **Do NOT auto-merge.** A PR to `main` is a release-readiness
   moment that the user owns. Wait for them to approve and merge
   it themselves. While you wait:

   - If CI goes red, fix and push the resolution. Stay on the same
     transition branch — do **not** cut a new one.
   - If `main` moves under you and the PR develops conflicts,
     resolve them in the worktree
     (`git fetch origin && git merge origin/main`), re-run the
     tests in step 4, push the resolution.

8. **After merge, clean up.** Same checklist as any feature branch:

       cd <repo root>
       git worktree remove .claude/worktrees/release-<slug>
       git branch -D release/<slug>
       # delete the remote ref if --delete-branch didn't catch it
       git ls-remote --heads origin release/<slug> \
         && git push origin --delete release/<slug>
       git fetch --prune origin

9. **No prod deploy from this merge.** Prod tracks `jalur-yasril`,
   not `main`. The `scripts/deploy.sh` step from `CLAUDE.md`
   §"Per-session lifecycle" §6 does **not** apply here — and
   anyway the script no longer exists on `main` after this PR
   lands. Merging the release PR ships the snapshot to `main`
   and nothing else.

## 4. Cleanup checklist

Each item below names a specific prod-orchestration artefact or
hardcode that must be neutralized before the transition branch
can land on `main`.

### 4.1 `docker-compose.yml` — **delete**

`docker-compose.yml` defines both the podman-compose stack and
the `cloudflared` sidecar that fronts `gnrs.brkh.work`. Both are
specific to our prod deployment. Delete the file:

    git rm docker-compose.yml

A fork that wants compose-style orchestration can write its own;
the application image (from `Dockerfile`) is portable on its own.

### 4.2 `scripts/deploy.sh` — **delete**

`scripts/deploy.sh` exists solely to rsync the source to
`laode@10.8.0.13`, run `podman-compose build && up -d` on the
remote, and conditionally bring up the `cloudflared` sidecar
when `CLOUDFLARE_TUNNEL_TOKEN` is set. None of that is
deploy-anywhere. Delete the file:

    git rm scripts/deploy.sh

If `scripts/` is left holding only `move-changes-off-main.sh`,
keep the directory — that helper is independent of the prod
stack and stays on `main`.

### 4.3 `.env.example`

Remove the `CLOUDFLARE_TUNNEL_TOKEN` block (the variable and its
multi-line comment about `docker compose --profile tunnel up -d`).
The token has no meaning without the sidecar, and the sidecar is
no longer on `main`.

Also re-word the `DATABASE_PATH` comment so it stops referring to
"the compose file" — replace with a generic "In Docker, mount a
volume at `/app/data`" note.

Add a brief comment line documenting `DATA_VOLUME` (used by the
Makefile `docker-run` target, see §4.4) so a fresh operator
understands the override knob.

### 4.4 `Makefile`

Introduce `DATA_VOLUME ?= ppg-data` at the top of the file and
replace the hardcoded volume name in the `docker-run` target:

    docker volume create $(DATA_VOLUME) >/dev/null
    docker run --rm -it --env-file .env -p 8080:8080 \
      -v $(DATA_VOLUME):/app/data ppg-dashboard:latest

Leave every other target alone — they are generic build/test
helpers, not deployment.

### 4.5 `CLAUDE.md`

- Replace every occurrence of `https://gnrs.brkh.work` with
  `$PROD_URL` (or "your production URL" in prose).
- Replace every occurrence of `10.8.0.13` and `laode@10.8.0.13`
  with `$DEPLOY_HOST` / `user@your-host`.
- Replace every occurrence of `/home/laode/ppg` with
  `$REMOTE_DIR`.
- Rewrite "Per-session lifecycle" step 6 ("Deploy to prod"):
  drop the `scripts/deploy.sh` invocation and replace with a
  one-line note that prod deploy is downstream-specific — point
  the reader at their own orchestration. Do the same for the
  parallel "Deploy to prod once the merge is clean" bullet under
  "Before you mark the task done".
- Rewrite the "Dev deployment (parallel agents)" section so it
  no longer assumes `podman-compose`, `cloudflared`, or any
  specific remote host. The general shape (build from your
  worktree, expose a non-prod port, namespace the container,
  tear it down on cleanup) can stay; strip out the
  `ppg-dev-<slug>` / `ppg-data-dev-<slug>` / `podman-compose -p`
  specifics.
- Keep the worktree + `jalur-yasril` integration workflow + the
  step-by-step commit rule intact — that is the project's real
  development model, not a deploy hardcode.

### 4.6 `TEST.md`

- Replace `https://gnrs.brkh.work` with `$PROD_URL`.
- Reword the "If you cannot reach `gnrs.brkh.work`" guidance to
  apply to any prod URL.

### 4.7 `README.md`

- Remove any prose describing `docker-compose`, `podman-compose`,
  the `cloudflared` sidecar, the `--profile tunnel` invocation,
  or `scripts/deploy.sh`. None of those exist on `main` after
  this PR.
- Keep (and, if needed, expand slightly) the generic Docker
  story: `make docker` builds the image; `make docker-run` runs
  it against `.env`; the named volume defaults to `ppg-data`
  but can be overridden with `DATA_VOLUME`.
- Replace any bare references to `https://gnrs.brkh.work`,
  `10.8.0.13`, or `/home/laode/ppg` with placeholders.

### 4.8 `RULES.md` — left unchanged by default

The workflow `RULES.md` describes is the project's real
development model; the `jalur-yasril` name is project history,
not a deploy hardcode. Do **not** edit `RULES.md` on the
transition branch.

### 4.9 What stays on `main`

After §4.1–§4.7 land, `main` retains exactly the deploy-anywhere
surface a fork needs:

- `Dockerfile` — generic container build, no host-specific knobs.
- `Makefile` — `docker` (build) and `docker-run` (run) targets,
  plus dev/test/typecheck helpers.
- `.env.example` — runtime env vars only; no tunnel token.
- Application source (Go + React) — unchanged.

`jalur-yasril` continues to carry `docker-compose.yml`,
`scripts/deploy.sh`, and the `CLOUDFLARE_TUNNEL_TOKEN` story on
top of that surface, because *that* branch is where production
to `gnrs.brkh.work` actually happens.

## 5. PR message template

Use this template verbatim for the release PR body. Fill the
placeholders from the actual diff before calling `gh pr create`.
The template is deliberately framed around *what is changing in
this PR* — it does **not** name the integration branch in the
title, summary, or body. Keep it that way.

```markdown
## Summary

- Cut a deploy-anywhere release snapshot of the project onto
  `main`.
- Bring in the feature work that accumulated since the last
  release point on `main`.
- Drop our specific production-orchestration artefacts
  (`docker-compose.yml`, `scripts/deploy.sh`, the
  `CLOUDFLARE_TUNNEL_TOKEN` story) so a fork on `main` boots
  with just `Dockerfile` + `Makefile` + `.env.example`.
- Genericize remaining prod-host references in the docs.

## What's changing

This PR refreshes `main` so it reads as a deploy-anywhere
snapshot. After merge, `main` will contain:

- **Feature commits since `main`'s last release point**:
  <bulleted summary derived from `git log --oneline main..HEAD`,
  grouped by area — e.g. "i18n", "bulk import/export",
  "dynamic API path", "absen mobile + WA". Cap at ~10 bullets;
  link the full log.>

- **Production-orchestration removals** (transition-branch only):
  - Deleted `docker-compose.yml` — the podman-compose stack and
    the `cloudflared` sidecar are tied to a specific prod
    deployment and do not belong on a portable snapshot.
  - Deleted `scripts/deploy.sh` — the push-to-`gnrs.brkh.work`
    helper is similarly deployment-specific.
  - `.env.example`: dropped `CLOUDFLARE_TUNNEL_TOKEN` and
    reworded the `DATABASE_PATH` comment so it no longer
    references the compose file.

- **Deploy-anywhere genericization**:
  - `Makefile`: parameterized the `ppg-data` volume name via
    `DATA_VOLUME`.
  - `CLAUDE.md` / `TEST.md` / `README.md`: replaced
    `gnrs.brkh.work`, `10.8.0.13`, `laode@10.8.0.13`, and
    `/home/laode/ppg` with placeholders; rewrote the "Deploy
    to prod" and "Dev deployment" sections to be
    orchestration-agnostic.

## What is NOT changing

- Runtime code (Go handlers, React components, schema) — the
  cleanup deletes orchestration files and edits docs only.
- Production deploy target — production continues to track the
  project's integration branch, not `main`. Merging this PR
  does not deploy anything.
- The development workflow described in `CLAUDE.md` /
  `RULES.md` — unchanged on the integration branch.

## Cleanup checklist (per `RELEASE.md` §4)

- [ ] `docker-compose.yml` deleted (§4.1)
- [ ] `scripts/deploy.sh` deleted (§4.2)
- [ ] `.env.example` `CLOUDFLARE_TUNNEL_TOKEN` dropped (§4.3)
- [ ] `Makefile` `DATA_VOLUME` parameterized (§4.4)
- [ ] `CLAUDE.md` prod-host references stripped (§4.5)
- [ ] `TEST.md` prod-URL genericized (§4.6)
- [ ] `README.md` compose/tunnel/host references stripped (§4.7)
- [ ] `RULES.md` left unchanged (§4.8)

## Verification grep

\`\`\`
$ git grep -nE 'gnrs\.brkh\.work|10\.8\.0\.13|laode@|/home/laode/ppg|ppg-data\b|cloudflared|CLOUDFLARE_TUNNEL|podman-compose|docker-compose'
<paste result — expect zero hits outside RELEASE.md>
\`\`\`

## Test plan

- [x] `go test ./...` — pass
- [x] `pnpm --dir web/app typecheck` — pass
- [ ] UI test pass via `TEST.md` — **N/A**, cleanup deletes
      orchestration files and edits docs only.
- [ ] Reviewer-confirmed: `main` after merge is buildable on a
      fresh host using `make docker && make docker-run` plus a
      filled-in `.env`.
```

## 6. Quick reference

| Step                    | Command / location                                     |
| ----------------------- | ------------------------------------------------------ |
| Cut transition branch   | `git worktree add … -b release/<slug> jalur-yasril`    |
| Cleanup checklist       | §4 of this doc                                         |
| Tests                   | `go test ./...`, `pnpm --dir web/app typecheck`        |
| Verification grep       | §3 step 5                                              |
| Open PR                 | `gh pr create --base main`                             |
| PR body                 | Template in §5                                         |
| Merge                   | **User-driven** — do not auto-merge                    |
| Prod deploy?            | No — prod still tracks `jalur-yasril`                  |
| Clean up after merge    | §3 step 8                                              |
