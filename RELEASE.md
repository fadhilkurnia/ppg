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

4. **Test (static checks)**:

       go test ./...
       pnpm --dir web/app typecheck

   These confirm the source carries over unchanged. A Chrome
   DevTools UI test pass against a dev deployment of the snapshot
   is **also** required — see step 7. The cleanup does not touch
   runtime code, but it does rewrite the `Dockerfile`-adjacent
   surface (`Makefile`, `.env.example`, `README.md`), and a fork
   following those instructions must end up with a working app.
   Run the static checks here so you catch obvious regressions
   before bothering with a remote build.

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

7. **Deploy the snapshot on `laode@10.8.0.13` and verify via
   Chrome DevTools.** This is the runtime smoke test that
   guarantees the cleanup did not break the deploy-anywhere path
   a fork would follow. Run it *after* `gh pr create`, not before
   — opening the PR first means the release branch is on `origin`
   and the remote can pull it directly.

   The pattern matches the per-feature dev deployment described
   in `CLAUDE.md` (separate container, separate volume, separate
   port, externally bound on `10.8.0.13:<port>`), but uses the
   snapshot's *generic* `Dockerfile` + `docker build` flow —
   there is no `scripts/deploy.sh` and no `docker-compose.yml` on
   this branch by design. That means a direct `docker run` on the
   remote, not the prod helper.

   From your main checkout (the remote command does not depend on
   any local worktree state):

       # Pick a free dev port (range 18080–18999). Check first:
       ssh laode@10.8.0.13 \
         'ss -tlnp | grep -E ":(180|181|182|183|184|185|186|187|188|189)[0-9][0-9]" || echo "no collisions in range"'

       # Clone (or pull) the release branch on the remote into a
       # per-slug directory, then build + run with dev-specific
       # overrides for name, port, volume, and image tag:
       ssh laode@10.8.0.13 bash <<'REMOTE'
       set -euo pipefail
       SLUG=<slug>
       PORT=<chosen port>
       REPO=/home/laode/ppg-release-$SLUG

       if [ -d "$REPO/.git" ]; then
         git -C "$REPO" fetch origin "release/$SLUG"
         git -C "$REPO" checkout "release/$SLUG"
         git -C "$REPO" pull --ff-only origin "release/$SLUG"
       else
         rm -rf "$REPO"
         git clone --branch "release/$SLUG" --single-branch \
           <origin URL from `git remote -v`> "$REPO"
       fi
       cd "$REPO"

       # First time around: cp .env.example .env and fill in the
       # values (admin seed, etc.). Do NOT reuse prod's .env —
       # the snapshot must stand on its own.

       docker build -t "ppg-dashboard-release-$SLUG:latest" .
       docker volume create "ppg-data-release-$SLUG" >/dev/null
       docker rm -f "ppg-release-$SLUG" 2>/dev/null || true
       docker run -d --name "ppg-release-$SLUG" \
         --env-file .env \
         -p "10.8.0.13:$PORT:8080" \
         -v "ppg-data-release-$SLUG:/app/data" \
         "ppg-dashboard-release-$SLUG:latest"
       docker logs --tail 50 "ppg-release-$SLUG"
       REMOTE

   Notes on the invocation:

   - The host port binds explicitly to `10.8.0.13`, not loopback,
     so Chrome DevTools can drive the dev URL from off-host.
   - Bypass `make docker-run` deliberately: that target hardcodes
     `-p 8080:8080`, which would collide with prod's container.
   - Container, volume, and image tag are all suffixed with the
     release slug so this stack cannot collide with prod's
     `ppg-data` volume / `ppg-dashboard:latest` image, nor with
     any parallel agent's per-feature dev stack.

   Then drive the full Chrome DevTools flow from `TEST.md`
   against `http://10.8.0.13:<port>`. `TEST.md` itself is
   deleted on the transition branch, but it still exists on
   `jalur-yasril` — read the procedure from your main checkout
   and apply it against the dev URL.

   **Pass criterion: feature parity with `jalur-yasril`.** Every
   user-facing capability listed in the Summary block of the PR
   body must work end-to-end on the snapshot, exactly as it does
   on `jalur-yasril`. Login, navigation, each bullet-listed
   feature, role-gated routes for `admin` vs `staff`, logout —
   all of it. If a feature regresses, the cleanup broke
   something (`README.md` instructions wrong, `.env.example`
   missing a knob, `Makefile` target broken on a fresh host,
   etc.) — fix it on the transition branch, `git push` to update
   the PR, let the remote re-pull (the conditional in the
   snippet above handles that), and re-test.

   After the UI test passes, fill in the `Tested via Chrome
   DevTools` section in the PR body (the template in §5 covers
   the shape) — use `gh pr edit --body-file <path>` or the GH web
   editor. Capture the dev URL, the port, the user flow you
   exercised, screenshots, and the network / console excerpts.

   The dev stack stays running until the post-merge cleanup in
   step 9 — keep it up while the user reviews so they can poke
   at it directly if they want.

8. **Do NOT auto-merge.** A PR to `main` is a release-readiness
   moment that the user owns. Wait for them to approve and merge
   it themselves. While you wait, the dev container from step 7
   stays up on `10.8.0.13:<port>` so the user can poke at it
   directly; if they ask for additional spot-checks, drive them
   through Chrome DevTools against the same dev URL.

   - If CI goes red, fix and push the resolution. Stay on the
     same transition branch — do **not** cut a new one. After
     the push, re-pull on the remote (the loop in step 7 handles
     that) and re-run the UI flow on the rebuilt container.
   - If `main` moves under you and the PR develops conflicts,
     resolve them in the worktree
     (`git fetch origin && git merge origin/main`), re-run the
     static tests in step 4 and the UI test in step 7, push the
     resolution.

9. **After merge, clean up — local refs *and* remote dev stack.**
   Both halves must run; a leftover dev container on
   `10.8.0.13` blocks the next release from reusing the slug or
   the port.

       cd <repo root>
       git worktree remove .claude/worktrees/release-<slug>
       git branch -D release/<slug>
       # delete the remote ref if --delete-branch didn't catch it
       git ls-remote --heads origin release/<slug> \
         && git push origin --delete release/<slug>
       git fetch --prune origin

       # Tear down the dev stack from step 7:
       ssh laode@10.8.0.13 bash <<'REMOTE'
       SLUG=<slug>
       docker rm -f "ppg-release-$SLUG" 2>/dev/null || true
       docker volume rm "ppg-data-release-$SLUG" 2>/dev/null || true
       docker image rm "ppg-dashboard-release-$SLUG:latest" 2>/dev/null || true
       rm -rf "/home/laode/ppg-release-$SLUG"
       REMOTE

10. **No prod deploy from this merge.** Prod tracks
    `jalur-yasril`, not `main`. The `scripts/deploy.sh` step
    from `CLAUDE.md` §"Per-session lifecycle" §6 does **not**
    apply here — and anyway the script no longer exists on
    `main` after this PR lands. The dev container in step 7
    was a verification stack, not a prod deploy; the teardown
    in step 9 removes it. Merging the release PR ships the
    snapshot to `main` and nothing else.

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

## Tested via Chrome DevTools

<Fill in after `RELEASE.md` §3 step 7. The shape (per `TEST.md`):

- **Dev URL** — `http://10.8.0.13:<port>` (the snapshot, in its
  own container / volume / image, all suffixed with the release
  slug — separate from prod's `8080` / `ppg-data` /
  `ppg-dashboard:latest`).
- **Build path** — `docker build` against this branch's
  `Dockerfile`, with the runtime override knobs (`DATA_VOLUME`,
  `.env`) used the way a fork following the `README.md` would
  use them. A green UI test here is also a green "fork can
  build and run this snapshot" signal.
- **User flow exercised** — login, navigation, each feature
  listed in the Summary above, role-gated routes for `admin`
  vs `staff`, logout. Drove both happy and at least one failure
  path per feature, per `TEST.md`.
- **Pass criterion met** — feature parity with the integration
  branch; every Summary bullet behaves identically on the
  snapshot.
- **Network / console excerpts** — paste the relevant
  `list_network_requests` rows; confirm `list_console_messages`
  reports no new errors introduced by the cleanup.
- **Screenshots** — attach `take_screenshot` output for each
  feature.>

## Test plan

- [x] `go test ./...` — pass
- [x] `pnpm --dir web/app typecheck` — pass
- [x] UI test pass — see "Tested via Chrome DevTools" above.
- [ ] Reviewer-confirmed: `main` after merge is buildable on a
      fresh host using `make docker && make docker-run` plus a
      filled-in `.env`.
```

## 6. Quick reference

| Step                    | Command / location                                     |
| ----------------------- | ------------------------------------------------------ |
| Cut transition branch   | `git worktree add … -b release/<slug> jalur-yasril`    |
| Cleanup checklist       | §4 of this doc                                         |
| Tests (static)          | `go test ./...`, `pnpm --dir web/app typecheck`        |
| Verification grep       | §3 step 5                                              |
| Open PR                 | `gh pr create --base main`                             |
| Dev deploy + UI test    | §3 step 7 — `http://10.8.0.13:<port>`, `TEST.md` flow  |
| PR body                 | Template in §5 (fill UI section after dev deploy)      |
| Merge                   | **User-driven** — do not auto-merge                    |
| Prod deploy?            | No — prod still tracks `jalur-yasril`                  |
| Clean up after merge    | §3 step 9 — local refs + remote dev stack              |
