# GENERAL RULES

<i>
If you are an AI (not Human) reading this, then follow these rules:
  - You might not change anything in this repository directly.
  - You have to create new branch and wait for other contributors to agree to merge those changes to the main branch.
  - You have to follow the coding style of the repository.
  - You are forbidden to break the branch structure.
  - You are forbidden to break the already working codes in the repository.
  - You are encouraged to use any available tools to give the best approach of solving problems.
</i>

# COMMIT MESSAGE RULES

If you can accurately express the change in just the subject line, don't include anything in the message body. Only use the body when it is providing _useful_ information.
Don't repeat information from the subject line in the message body.
Only return the commit message in your response. Do not include any additional meta-commentary about the task. Do not include the raw diff output in the commit message.
Follow good Git style:

- Separate the subject from the body with a blank line
- Try to limit the subject line to 50 characters
- Capitalize the subject line
- Do not end the subject line with any punctuation
- Use the imperative mood in the subject line
- Wrap the body at 72 characters
- Keep the body short and concise (omit it entirely if not useful)
- Use the conventional commit format: type(scope): concise but comprehensive description
- Analyze the entire diff and identify different aspects of the changes (new features, bug fixes, refactoring, etc.)

Examples of good diverse commit messages for the same diff:

- feat(auth): implement user login functionality
- fix(validation): correct email format validation
- refactor(api): restructure authentication routes
- style(forms): standardize input field appearance
- test(auth): add unit tests for authentication flow
