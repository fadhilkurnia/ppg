# FEATURE TEST RULES

_If you are an AI (not human) reading this, follow these rules every
time you build, change, or fix a feature in this repository._

## TL;DR

After implementing a feature, **you must exercise it through Chrome
DevTools against the public deployment at `https://gnrs.brkh.work`**
before you mark the work done, open a PR, or hand back to the user.
Type-checking and `go test` confirm code correctness, not feature
correctness.

The Chrome DevTools MCP server is available — use the
`mcp__chrome-devtools__*` tools. Do **not** test against `localhost`
in place of the public domain; the goal is to verify the change in
the same path real users hit (Cloudflare Tunnel → app container →
SPA), not a local dev server.

## Public test target

| Field        | Value                                  |
| ------------ | -------------------------------------- |
| Base URL     | `https://gnrs.brkh.work`               |
| Login page   | `https://gnrs.brkh.work/login`         |
| API base     | `https://gnrs.brkh.work/api` (or the dynamic 12-hex prefix when `DYNAMIC_API_PATH=true`) |
| Health probe | `https://gnrs.brkh.work/healthz`       |

The deployment is fronted by a Cloudflare Tunnel and serves the same
single-binary image documented in `README.md`. Treat it as the
integration environment: it always reflects what is merged on
`jalur-yasril`.

## Required test flow for any new / changed feature

Run these steps with the Chrome DevTools MCP tools. Do **not** skip
steps — a green typecheck is not a substitute for actually clicking
through the feature.

1. **Open a page** at `https://gnrs.brkh.work` (`new_page` or
   `navigate_page`).
2. **Confirm the page rendered** with `take_snapshot` (DOM) or
   `take_screenshot` (visual). Note the title and that the SPA bundle
   loaded.
3. **Sign in** through the form using `fill_form` / `click`. Use the
   seed admin credentials configured for the deployment; never paste
   secrets into source files or commits.
4. **Drive the feature end-to-end** — navigate to the route it lives
   on, fill its inputs, submit, paginate, etc. — using `click`,
   `fill`, `type_text`, `press_key`, `hover`, `wait_for` as needed.
   Exercise both the happy path and at least one failure path
   (validation error, 4xx response, empty state, …).
5. **Watch the network**: call `list_network_requests` and
   `get_network_request` for the API calls the feature triggers.
   Verify status codes, that the response shape matches what the SPA
   expects, and that requests go to the right `apiBase`
   (`/api/...` or `/<dynamic-prefix>/...`).
6. **Watch the console**: `list_console_messages` must contain no
   new errors or unhandled-promise warnings introduced by the
   change. Capture any noise that pre-existed.
7. **Check for regressions** in adjacent flows you might have
   touched (login, students list, role-gated routes for `admin` vs
   `staff`). One quick sweep through neighbouring screens is enough.
8. **Sign out** with the logout control and confirm the session
   cookie is cleared (re-hitting a protected route should redirect
   to `/login`).

If any step fails, fix the code and rerun the flow from step 1.
Do not paper over errors with retries or `wait_for` loops.

## When you cannot reach the public domain

If `https://gnrs.brkh.work` is unreachable (DNS failure, 5xx,
tunnel down, MCP tool unavailable):

- **Do not silently fall back to `localhost`** and claim the feature
  is verified.
- Say so explicitly in your end-of-turn summary: "couldn't reach
  gnrs.brkh.work, feature is not browser-tested."
- Still run `go test ./...` and `pnpm --dir web/app typecheck`, and
  report those results separately.
- The user decides whether to proceed without a browser test.

## What to include in the PR description

For every PR that changes user-visible behaviour, the description
must include:

- A short "Tested via Chrome DevTools on gnrs.brkh.work" section.
- The user flow you exercised (bullet list of clicks/inputs).
- Any screenshots or network/console excerpts that prove the
  feature works — `take_screenshot` output and copy-paste from
  `list_network_requests` is fine.
- An explicit note if a step was skipped and why.

Backend-only changes that do not affect the UI (e.g. a new
migration that nothing reads yet) are exempt, but say so in the PR.
