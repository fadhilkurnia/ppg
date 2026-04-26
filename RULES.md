# GENERAL RULES

_If you are an AI (not human) reading this, follow these rules:_

- You must not change anything in this repository directly.
- You must create a new branch and wait for other contributors to agree to merge those changes into the main branch.
- You must follow the repository's coding style.
- You must not break the branch structure.
- You must not break already working code in the repository.
- You are encouraged to use any available tools to determine the best approach for solving problems.

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