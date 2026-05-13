# GENERAL RULES

_If you are an AI (not human) reading this, follow these rules:_

- You must not commit directly to any shared branch — that means `main`,
  `jalur-yasril`, or another agent's feature branch.
- Before you start working, create your own git worktree so you do not
  conflict with other LLMs running in parallel on this repository. Branch
  from `jalur-yasril`, not from `main`:

      git worktree add .claude/worktrees/<short-task-name> \
        -b feat/<short-task-name> jalur-yasril

  Then `cd` into that worktree and do all of your editing, building, and
  committing there.
- When the work is ready, open a pull request targeting `jalur-yasril`.
  Do **not** target `main` — `main` is frozen until a release-readiness
  merge and is not the integration branch. The sole exception is the
  release-promotion flow described in [`RELEASE.md`](./RELEASE.md),
  which uses a short-lived `release/<slug>` transition branch and is
  only invoked when the user explicitly asks for a "PR to main".
- After the PR is merged (or abandoned), clean up:

      git worktree remove .claude/worktrees/<short-task-name>

- You must follow the repository's coding style.
- You must not break the branch structure (do not rebase or force-push
  shared branches, do not delete `jalur-yasril` or `main`).
- You must not break already working code in the repository.
- You are encouraged to use any available tools to determine the best
  approach for solving problems.

# COMMIT MESSAGE RULES

If you can accurately express the change in just the subject line, do not include a message body.
Only use the body when it provides useful information. Do not repeat information from the subject
line in the body.

When producing commit messages, follow these guidelines:

- Return only the commit message in automated responses (do not include meta-commentary or raw diffs).
- Separate the subject from the body with a blank line.
- Try to limit the subject line to 50 characters.
- Capitalize the subject line.
- Do not end the subject line with punctuation.
- Use the imperative mood in the subject line.
- Wrap the body at 72 characters.
- Keep the body short and concise (omit it entirely if not useful).
- Use the conventional commit format when appropriate: `type(scope): concise but comprehensive description`.
- When applicable, analyze the entire diff and identify different aspects of the changes
  (e.g., new features, bug fixes, refactoring).

Examples of good, diverse commit messages for the same diff:

- feat(auth): implement user login functionality
- fix(validation): correct email format validation
- refactor(api): restructure authentication routes
- style(forms): standardize input field appearance
- test(auth): add unit tests for authentication flow