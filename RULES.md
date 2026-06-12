# RULES.md — Rules for AI / LLM Agents

These rules are **mandatory** for any AI or LLM agent (Claude Code, Copilot, Cursor,
or any automated assistant) operating in this repository.

## 1. Never push directly to `main`

- **DO NOT** commit to `main`.
- **DO NOT** push to `main`.
- **DO NOT** force-push to `main`.
- `main` is updated **only** by merging an approved Pull Request.

## 2. Always work on a branch

Before making any change, create a working branch off the latest `main`:

```bash
git checkout main
git pull origin main
git checkout -b <type>/<short-description>
```

Branch name `<type>` prefixes:

| Type       | Use for                          |
|------------|----------------------------------|
| `feat/`    | New features                     |
| `fix/`     | Bug fixes                        |
| `chore/`   | Tooling, deps, housekeeping       |
| `docs/`    | Documentation-only changes       |
| `refactor/`| Code restructuring, no behavior  |

Examples: `feat/excel-export`, `fix/auth-token-refresh`, `docs/podman-setup`.

## 3. Open a Pull Request — every time

All changes reach `main` through a PR from the working branch:

```bash
git push -u origin <your-branch>
gh pr create --base main --head <your-branch> --fill
```

Requirements for every PR:

- Targets `main` as the base branch.
- Has a clear title and a description of **what** changed and **why**.
- Passes CI / build checks before requesting merge.
- Is reviewed and approved by a human before merge.

## 4. The agent does not self-merge

- An AI/LLM agent **MUST NOT** merge its own PR.
- Merging is a human decision. Wait for explicit approval.

## 5. If you find yourself on `main`

Stop. Move your work to a branch before committing:

```bash
git checkout -b <type>/<short-description>
```

If changes were already committed to local `main` by mistake, move them onto a
branch and reset local `main` to the remote — **do not push the local `main`.**

## 6. Summary checklist

Before requesting a merge, confirm:

- [ ] Work was done on a dedicated branch, not `main`.
- [ ] Branch is up to date with `main`.
- [ ] A PR was opened from the branch into `main`.
- [ ] CI checks pass.
- [ ] A human has reviewed and approved.
- [ ] No direct push or force-push to `main` occurred.

**Bottom line: AI/LLM agents must never push to `main`. Always branch, always PR.**
