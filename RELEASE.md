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

The LLM-agent rule / guide files (`CLAUDE.md`, `RULES.md`,
`TEST.md`, and this `RELEASE.md`) are also integration-only.
They describe how *we* run the project (worktree workflow,
commit-message style, Chrome-DevTools test procedure, release
plumbing) — none of that is relevant to a fork consuming the
snapshot. They get deleted from the transition branch before
it lands on `main`.

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
       chore(release): drop LLM-rules docs from main
       chore(release): drop RELEASE.md from main
       chore(env): drop CLOUDFLARE_TUNNEL_TOKEN from example
       chore(make): parameterize data volume via DATA_VOLUME
       docs(readme): strip prod-host references

   Conventional-commit subjects, imperative mood, ≤ 50 chars, no
   trailing punctuation.

   Order the deletes before the doc edits — once `CLAUDE.md` /
   `RULES.md` / `TEST.md` / `RELEASE.md` are gone, you obviously
   can't keep editing them, and trying to do both in one commit
   makes the diff harder to read.

4. **Test**:

       go test ./...
       pnpm --dir web/app typecheck

   A Chrome DevTools UI test pass via `TEST.md` is **not** required
   for a release PR — the cleanup deletes orchestration files,
   deletes the LLM-agent docs, and genericizes a handful of the
   survivors. No runtime code is touched. State this explicitly
   in the PR description (the template in §5 already does).

5. **Verification grep** — before opening the PR, from inside the
   worktree:

       git grep -nE 'gnrs\.brkh\.work|10\.8\.0\.13|laode@|/home/laode/ppg|ppg-data\b|cloudflared|CLOUDFLARE_TUNNEL|podman-compose|docker-compose'

   Expect **zero hits** — `RELEASE.md` (which used to be the
   self-exception) is itself deleted on the transition branch by
   this point. Paste the result into the PR's "Verification grep"
   block.

6. **Open the PR against `main`**:

       gh pr create --base main \
         --title 'release: deploy-anywhere snapshot (<slug>)' \
         --body "$(cat <<'EOF'
       <fill in the template from §5>
       EOF
       )"

   The PR's **Summary** block must be a feature list — what
   `main` *gains* if this PR merges, derived from
   `git log --oneline main..HEAD` and grouped by user-facing
   area. The cleanup mechanics (which files got deleted, what
   was genericized) live in a separate "Release-only cleanups"
   section lower down, not in the Summary. Keep `jalur-yasril`
   out of the title, Summary, and body. The template in §5 is
   already worded that way; follow it.

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

Each item below names a specific artefact or hardcode that must
be neutralized before the transition branch can land on `main`.
The deletes (§4.1–§4.6) come first; the file-edits (§4.7–§4.9)
come after.

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

### 4.3 `CLAUDE.md` — **delete**

`CLAUDE.md` is the instruction sheet for LLM agents working in
this repo (worktree workflow, per-session lifecycle, dev-deploy
rules, etc.). It is integration-branch-only — a fork has its own
contributor model and does not need ours. Delete the file:

    git rm CLAUDE.md

### 4.4 `RULES.md` — **delete**

`RULES.md` codifies our branch / PR / commit-message rules for
LLM agents. Same reasoning as §4.3 — useful to *us*, noise to a
fork. Delete the file:

    git rm RULES.md

### 4.5 `TEST.md` — **delete**

`TEST.md` is our Chrome-DevTools test procedure for LLM agents,
written around `gnrs.brkh.work` and our specific UI flows. Not
relevant to a fork. Delete the file:

    git rm TEST.md

### 4.6 `RELEASE.md` — **delete**

This very document is the LLM-facing release workflow for
promoting `jalur-yasril` to `main`. On `main` itself, no agent
needs it — `main` is a one-way snapshot, not the place where the
release workflow runs. Delete the file:

    git rm RELEASE.md

The transition branch is cut from `jalur-yasril`, where
`RELEASE.md` still exists, so the agent driving the release
still reads this file normally — only the snapshot on `main`
loses it.

### 4.7 `.env.example`

Remove the `CLOUDFLARE_TUNNEL_TOKEN` block (the variable and its
multi-line comment about `docker compose --profile tunnel up -d`).
The token has no meaning without the sidecar, and the sidecar is
no longer on `main`.

Also re-word the `DATABASE_PATH` comment so it stops referring to
"the compose file" — replace with a generic "In Docker, mount a
volume at `/app/data`" note.

Add a brief comment line documenting `DATA_VOLUME` (used by the
Makefile `docker-run` target, see §4.8) so a fresh operator
understands the override knob.

### 4.8 `Makefile`

Introduce `DATA_VOLUME ?= ppg-data` at the top of the file and
replace the hardcoded volume name in the `docker-run` target:

    docker volume create $(DATA_VOLUME) >/dev/null
    docker run --rm -it --env-file .env -p 8080:8080 \
      -v $(DATA_VOLUME):/app/data ppg-dashboard:latest

Leave every other target alone — they are generic build/test
helpers, not deployment.

### 4.9 `README.md`

- Remove any prose describing `docker-compose`, `podman-compose`,
  the `cloudflared` sidecar, the `--profile tunnel` invocation,
  or `scripts/deploy.sh`. None of those exist on `main` after
  this PR.
- Remove any prose pointing readers at `CLAUDE.md`, `RULES.md`,
  `TEST.md`, or `RELEASE.md` — those files are gone on `main`.
- Keep (and, if needed, expand slightly) the generic Docker
  story: `make docker` builds the image; `make docker-run` runs
  it against `.env`; the named volume defaults to `ppg-data`
  but can be overridden with `DATA_VOLUME`.
- Replace any bare references to `https://gnrs.brkh.work`,
  `10.8.0.13`, or `/home/laode/ppg` with placeholders.

### 4.10 What stays on `main`

After §4.1–§4.9 land, `main` retains exactly the deploy-anywhere
surface a fork needs — and nothing else:

- `Dockerfile` — generic container build, no host-specific knobs.
- `Makefile` — `docker` (build) and `docker-run` (run) targets,
  plus dev/test/typecheck helpers.
- `.env.example` — runtime env vars only; no tunnel token.
- `README.md` — project overview, stack, build/run instructions,
  with prod-host references genericized.
- `docs/` (e.g. `docs/schema.md`) — general project docs (DB
  schema, etc.), not LLM-targeted.
- Application source (Go + React) — unchanged.

`jalur-yasril` continues to carry `docker-compose.yml`,
`scripts/deploy.sh`, the `CLOUDFLARE_TUNNEL_TOKEN` story, and
the full set of LLM-agent docs (`CLAUDE.md`, `RULES.md`,
`TEST.md`, `RELEASE.md`) on top of that surface, because *that*
branch is where the project is actually developed and where
production to `gnrs.brkh.work` actually happens.

## 5. PR message template

Use this template verbatim for the release PR body. Fill the
placeholders from the actual diff before calling `gh pr create`.
The template is deliberately framed around *what users gain by
merging this PR*. Two non-negotiables:

1. **The Summary block lists the features being added** —
   nothing else. No "we cut a snapshot" / "we dropped the compose
   stack" / "we genericized docs" meta-bullets. A reviewer reading
   only the Summary should come away knowing which capabilities
   `main` is gaining.
2. **No mention of the integration branch by name** anywhere in
   the title, Summary, or body.

The cleanup mechanics still need to be documented — they live in
the "Release-only cleanups" section further down, where reviewers
who care about the build/orchestration side can find them.

```markdown
## Summary

<Bulleted list of features being added to `main` by this PR,
derived from `git log --oneline main..HEAD` and grouped by
user-facing area. The reader should finish this section knowing
what new capabilities `main` will have after merge — *not* what
files this PR deleted or genericized (those go in "Release-only
cleanups" below).

Example shape (for a release that includes i18n, bulk
import/export, the dynamic API path, and the absen flow):

- **Internationalization** — multi-language UI with runtime
  language switching across <list of major screens>.
- **Bulk import/export** — admins can import students/teachers
  from CSV and export current rosters from the dashboard.
- **Dynamic API path** — defence-in-depth against CSRF by issuing
  a per-session API prefix at login and routing the SPA through
  it.
- **Mobile attendance (`absen`)** — students mark their own
  attendance from a phone; WhatsApp follow-up for missing
  check-ins.

Aim for ~5–10 bullets. Lead with the largest user-visible change;
group related commits under one bullet. Link the full log
(`main..HEAD`) at the end of the section if there is overflow.>

## Release-only cleanups

In addition to the features above, this transition branch applies
the deploy-anywhere cleanup so `main` reads as a portable
snapshot. None of these changes touch runtime code.

- **Production-orchestration removals**:
  - Deleted `docker-compose.yml` — the podman-compose stack and
    the `cloudflared` sidecar are tied to a specific prod
    deployment and do not belong on a portable snapshot.
  - Deleted `scripts/deploy.sh` — the push-to-`gnrs.brkh.work`
    helper is similarly deployment-specific.
  - `.env.example`: dropped `CLOUDFLARE_TUNNEL_TOKEN` and
    reworded the `DATABASE_PATH` comment so it no longer
    references the compose file.

- **LLM-agent docs removals**:
  - Deleted `CLAUDE.md` — agent instructions, integration-only.
  - Deleted `RULES.md` — branch / PR / commit-message rules,
    integration-only.
  - Deleted `TEST.md` — Chrome-DevTools test procedure,
    integration-only.
  - Deleted `RELEASE.md` — this release workflow itself,
    integration-only.

- **Deploy-anywhere genericization** (surviving docs):
  - `Makefile`: parameterized the `ppg-data` volume name via
    `DATA_VOLUME`.
  - `README.md`: replaced `gnrs.brkh.work`, `10.8.0.13`,
    `laode@10.8.0.13`, and `/home/laode/ppg` with placeholders;
    stripped any prose pointing readers at the now-deleted
    agent docs or the now-deleted compose stack.

## What is NOT changing

- Runtime code authored on this transition branch — none. The
  feature commits in the Summary above came from the integration
  branch unchanged; this branch only deletes orchestration +
  agent-doc files and edits `README.md` / `Makefile` /
  `.env.example`.
- Production deploy target — production continues to track the
  project's integration branch, not `main`. Merging this PR
  does not deploy anything.
- The development workflow itself — unchanged on the
  integration branch, where the agent docs continue to live.

## Cleanup checklist (per `RELEASE.md` §4)

- [ ] `docker-compose.yml` deleted (§4.1)
- [ ] `scripts/deploy.sh` deleted (§4.2)
- [ ] `CLAUDE.md` deleted (§4.3)
- [ ] `RULES.md` deleted (§4.4)
- [ ] `TEST.md` deleted (§4.5)
- [ ] `RELEASE.md` deleted (§4.6)
- [ ] `.env.example` `CLOUDFLARE_TUNNEL_TOKEN` dropped (§4.7)
- [ ] `Makefile` `DATA_VOLUME` parameterized (§4.8)
- [ ] `README.md` compose/tunnel/host/agent-doc refs stripped
      (§4.9)

## Verification grep

\`\`\`
$ git grep -nE 'gnrs\.brkh\.work|10\.8\.0\.13|laode@|/home/laode/ppg|ppg-data\b|cloudflared|CLOUDFLARE_TUNNEL|podman-compose|docker-compose'
<paste result — expect zero hits>
\`\`\`

## Test plan

- [x] `go test ./...` — pass
- [x] `pnpm --dir web/app typecheck` — pass
- [ ] UI test pass — **N/A**, cleanup deletes orchestration and
      agent-doc files and edits a handful of generic docs only.
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
