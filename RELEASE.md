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

`main` never receives `jalur-yasril` directly. The integration branch
has host-specific defaults baked into its source (prod SSH target,
prod URL, prod volume names, etc.) so that day-to-day deploys to
`gnrs.brkh.work` are zero-friction. A release snapshot on `main`
should read as **deploy-anywhere** — someone forking the repo or
re-hosting the app should be able to boot it without inheriting
those defaults.

To bridge that, you cut a short-lived **transition branch**
(`release/<slug>`) off `jalur-yasril`, apply the deploy-anywhere
cleanup checklist (§4) on the transition branch only, and PR *that*
into `main`. `jalur-yasril` keeps its prod-host defaults; `main`
becomes the portable snapshot.

The transition branch is single-use. After the PR merges (or is
abandoned), the branch is deleted and the next release cuts a fresh
one.

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

       chore(deploy): drop prod-host defaults from deploy.sh
       chore(compose): parameterize data volume via DATA_VOLUME
       chore(make): use DATA_VOLUME in docker-run target
       docs: strip prod-host references for main release
       docs(env): document SSH_HOST/REMOTE_DIR/DATA_VOLUME

   Conventional-commit subjects, imperative mood, ≤ 50 chars, no
   trailing punctuation.

4. **Test**:

       go test ./...
       pnpm --dir web/app typecheck

   A Chrome DevTools UI test pass via `TEST.md` is **not** required
   for a release PR — the cleanup touches scripts, compose, and
   docs only, not runtime code. State this explicitly in the PR
   description (the template in §5 already does).

5. **Verification grep** — before opening the PR, from inside the
   worktree:

       git grep -nE 'gnrs\.brkh\.work|10\.8\.0\.13|laode@|/home/laode/ppg|ppg-data\b'

   Expect zero hits **outside `RELEASE.md` itself** (this doc names
   those strings as cleanup targets, so it will match). Paste the
   result into the PR's "Verification grep" block.

6. **Open the PR against `main`**:

       gh pr create --base main \
         --title 'release: promote jalur-yasril to main (<slug>)' \
         --body "$(cat <<'EOF'
       <fill in the template from §5>
       EOF
       )"

   This is the only sanctioned `--base main` PR in the repo's
   workflow. Every other PR still targets `jalur-yasril`.

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
   §"Per-session lifecycle" §6 does **not** apply here. Merging
   the release PR ships the snapshot to `main` and nothing else.

## 4. Deploy-anywhere cleanup checklist

Each item below names a specific hardcode that must be neutralized
before the transition branch can land on `main`. The line numbers
are anchors at the time this doc was written — verify them with a
fresh grep before editing.

### 4.1 `scripts/deploy.sh`

- Drop the `laode@10.8.0.13` and `/home/laode/ppg` defaults. Treat
  `SSH_HOST` and `REMOTE_DIR` as **required** env vars — fail
  early with a clear message if either is unset.
- Update the comment header so "Default target: laode@10.8.0.13"
  becomes "Target: $SSH_HOST ($REMOTE_DIR) — both required".
- Keep `PORT=8080` as a default (it is generic, not host-specific).
- Keep the `CLOUDFLARE_TUNNEL_TOKEN` conditional logic as-is — it
  is already optional and already deploy-anywhere.

### 4.2 `docker-compose.yml`

- Parameterize the named volume:

      volumes:
        - ${DATA_VOLUME:-ppg-data}:/app/data
      ...
      volumes:
        ${DATA_VOLUME:-ppg-data}:

  (compose accepts variable substitution in the top-level
  `volumes:` keys.) Default kept as `ppg-data` so existing deploys
  do not break.

### 4.3 `Makefile`

- Introduce `DATA_VOLUME ?= ppg-data` at the top of the file and
  replace the hardcoded volume name in the `docker-run` target:

      docker volume create $(DATA_VOLUME) >/dev/null
      docker run --rm -it --env-file .env -p 8080:8080 \
        -v $(DATA_VOLUME):/app/data ppg-dashboard:latest

### 4.4 `CLAUDE.md`

- Replace every occurrence of `https://gnrs.brkh.work` with
  `$PROD_URL` (or "your production URL" in prose).
- Replace every occurrence of `10.8.0.13` and `laode@10.8.0.13`
  with `$DEPLOY_HOST` / `user@your-host`.
- Rewrite the "Dev deployment (parallel agents)" section so the
  remote-host examples use placeholders, not the literal prod
  host.
- Keep the workflow itself (worktree + jalur-yasril integration +
  step-by-step commits) intact — that is the project's real
  development model, not a deploy hardcode.

### 4.5 `TEST.md`

- Replace `https://gnrs.brkh.work` with `$PROD_URL`.
- Reword the "If you cannot reach `gnrs.brkh.work`" guidance to
  apply to any prod URL.

### 4.6 `README.md`

- Replace bare references to the `ppg-data` named volume with
  `$DATA_VOLUME` (or "the configured data volume") and add a
  one-line note that `DATA_VOLUME` is the override knob.

### 4.7 `.env.example`

- Add `SSH_HOST`, `REMOTE_DIR`, and `DATA_VOLUME` to the example
  with brief comments. They are deploy-time knobs, not runtime
  env, but `.env.example` is the single bootstrap surface a fresh
  operator reads.

### 4.8 `RULES.md` — left unchanged by default

The workflow `RULES.md` describes is the project's real
development model; the `jalur-yasril` name is project history,
not a deploy hardcode. Do **not** edit `RULES.md` on the
transition branch.

## 5. PR message template

Use this template verbatim for the release PR body. Fill the
placeholders from the actual diff before calling `gh pr create`.

```markdown
## What's changing in `main`

This PR promotes `jalur-yasril` to `main` as a deploy-anywhere
release snapshot. After merge, `main` will contain:

- **Feature commits from `jalur-yasril`** (since `main`'s last
  release point):
  <bulleted summary derived from `git log --oneline main..HEAD`,
  grouped by area — e.g. "i18n", "bulk import/export",
  "dynamic API path", "absen mobile + WA". Cap at ~10 bullets;
  link the full log.>

- **Release-only cleanups** (this branch, not on `jalur-yasril`):
  - `scripts/deploy.sh`: dropped `laode@10.8.0.13` and
    `/home/laode/ppg` defaults; `SSH_HOST` + `REMOTE_DIR` are now
    required env vars.
  - `docker-compose.yml` / `Makefile` / `README.md`: parameterized
    the `ppg-data` volume name via `DATA_VOLUME`.
  - `CLAUDE.md` / `TEST.md`: replaced `gnrs.brkh.work` and
    `10.8.0.13` references with generic placeholders.
  - `.env.example`: documented `SSH_HOST`, `REMOTE_DIR`,
    `DATA_VOLUME` as deploy knobs.

## What is NOT changing

- Runtime code (Go handlers, React components, schema) — the
  cleanup touches scripts, compose, and docs only.
- Prod deploy target — prod continues tracking `jalur-yasril`.
  Merging this PR does not deploy anything.
- The `jalur-yasril` integration workflow described in
  `CLAUDE.md` / `RULES.md` — unchanged on `jalur-yasril`.

## Cleanup checklist (per `RELEASE.md` §4)

- [ ] `scripts/deploy.sh` SSH defaults dropped (§4.1)
- [ ] `docker-compose.yml` `DATA_VOLUME` parameterized (§4.2)
- [ ] `Makefile` `DATA_VOLUME` parameterized (§4.3)
- [ ] `CLAUDE.md` prod-host references stripped (§4.4)
- [ ] `TEST.md` prod-URL genericized (§4.5)
- [ ] `README.md` `ppg-data` references stripped (§4.6)
- [ ] `.env.example` documents new knobs (§4.7)
- [ ] `RULES.md` left unchanged (§4.8)

## Verification grep

\`\`\`
$ git grep -nE 'gnrs\.brkh\.work|10\.8\.0\.13|laode@|/home/laode/ppg|ppg-data\b'
<paste result — expect zero hits outside RELEASE.md>
\`\`\`

## Test plan

- [x] `go test ./...` — pass
- [x] `pnpm --dir web/app typecheck` — pass
- [ ] UI test pass via `TEST.md` — **N/A**, cleanup touches
      scripts and docs only.
- [ ] Reviewer-confirmed: `main` after merge is deployable on a
      fresh host using only `.env.example` as a starting point.
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
