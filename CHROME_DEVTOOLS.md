# Chrome DevTools — parallel usage

Multiple LLM agents work in this repo in parallel (each in its own
worktree under `.claude/worktrees/<name>`). When more than one
agent needs Chrome DevTools at the same time — e.g. running the
[`TEST.md`](./TEST.md) flow against a dev pod or
`https://gnrs.brkh.work` — they share a **single long-lived
headless Chrome** over its remote-debugging port instead of each
spawning their own browser. This file is how you join that shared
instance without clobbering the other agents.

If the work you are doing does **not** touch a browser at all,
skip this file.

## The shared Chrome instance

The canonical launch command is:

```sh
google-chrome-stable \
  --remote-debugging-port=9222 \
  --user-data-dir=/home/loomino/.browser-debug \
  --headless=new
```

- **Port**: `9222` (DevTools Protocol on `127.0.0.1:9222`).
- **User data dir**: `/home/loomino/.browser-debug` — a single
  shared profile so cookies/sessions persist across agents and
  across sessions. Do not change it.
- **Headless mode**: `--headless=new` (the modern headless
  implementation; the old `--headless` is deprecated).
- Runs on the **local machine** (where the agents run), not on
  the remote deploy host.

The Chrome DevTools MCP server (`mcp__chrome-devtools__*` tools)
is configured to talk to this endpoint. You don't connect to
Chrome directly — the MCP server does — but you are still
responsible for making sure Chrome is up before you call into
the MCP.

## Mandatory pre-flight: is port 9222 already up?

**Before any `mcp__chrome-devtools__*` call**, check whether the
shared Chrome is already running. Do **not** relaunch blindly —
that will either fail (port busy / user-data-dir locked) or, worse,
kill the browser another agent is mid-test on.

Use the DevTools `/json/version` endpoint — it answers only when
Chrome is actually serving the protocol, not just when something
has grabbed the TCP port:

```sh
curl -fs --max-time 2 http://127.0.0.1:9222/json/version >/dev/null \
  && echo "chrome up" \
  || echo "chrome down"
```

(`ss -tlnp | grep :9222` works as a coarse fallback but does not
tell you whether the listener is actually Chrome's DevTools
endpoint — `/json/version` does.)

### If Chrome is up

Skip ahead to *Connect via MCP*. **Do not** restart Chrome —
other agents may be in the middle of their own tests.

### If Chrome is down

Start it detached so it outlives this turn, then poll until the
protocol responds:

```sh
nohup google-chrome-stable \
  --remote-debugging-port=9222 \
  --user-data-dir=/home/loomino/.browser-debug \
  --headless=new \
  >/tmp/chrome-debug.log 2>&1 &
disown

until curl -fs --max-time 1 http://127.0.0.1:9222/json/version \
        >/dev/null 2>&1; do
  sleep 0.2
done
echo "chrome up"
```

Only after the poll succeeds may you issue an MCP call. If
`/tmp/chrome-debug.log` shows a startup error (port already taken
by a non-Chrome process, profile locked, missing binary, …),
**stop and diagnose** — do not try to muscle past it with `--force`
flags or by killing the offending process; you may be looking at
another agent's live Chrome.

## Connect via MCP

Once Chrome is confirmed up on `127.0.0.1:9222`:

1. `mcp__chrome-devtools__list_pages` — see what tabs already
   exist. Other agents may have tabs open mid-flow.
2. `mcp__chrome-devtools__new_page` — open **your own** tab for
   your task. Always create a new tab; never hijack an existing
   one.
3. `mcp__chrome-devtools__select_page` — make your tab the active
   target so subsequent `navigate_page` / `click` / `fill` /
   `take_snapshot` etc. operate on your tab, not on someone
   else's.
4. Drive the feature per [`TEST.md`](./TEST.md) (login, exercise
   the feature end-to-end, watch network + console, etc.).
5. `mcp__chrome-devtools__close_page` — close the tab(s) **you**
   created when the test pass is done so the page list does not
   grow unbounded across many agent runs.

## Parallel etiquette

Hard rules for sharing the browser:

- **One tab per agent task.** Never reuse another agent's tab —
  its URL, cookies, or DOM state may be mid-request.
- **Do not kill or restart Chrome** unless you launched it in this
  same turn and it failed to start cleanly. A `pkill chrome` or
  `kill <pid>` severs every other parallel agent.
- **Do not wipe cookies / localStorage / IndexedDB on the shared
  profile.** Per-tab navigation away from a logged-in session is
  fine; clearing browser-wide storage is not.
- **Do not change global Chrome flags** mid-session. Per-tab
  emulation (`mcp__chrome-devtools__emulate`, `resize_page`) is
  scoped to your page and is fine.
- **Close only your own tabs.** If `list_pages` shows tabs you
  didn't open, leave them alone — they belong to another agent.

## Troubleshooting

- `curl /json/version` returns nothing → Chrome is not running.
  Start it with the launch command above and poll until ready.
- `curl /json/version` works but MCP `list_pages` errors → the
  MCP server is not pointing at `127.0.0.1:9222`. Check the MCP
  config; **do not** restart Chrome.
- Port 9222 is in use but `/json/version` returns 404 / a non-JSON
  body → something other than Chrome's DevTools endpoint has
  grabbed the port. Stop and tell the user — do not silently pick
  a different port (the MCP server is wired to 9222).
- Profile locked (`SingletonLock` / `ProcessSingleton` in the
  Chrome log) → an older Chrome process is still alive against the
  same `--user-data-dir`. Investigate before killing anything; you
  may be looking at another agent's live session.
- Tab list grows huge → other agents forgot to clean up. Close
  only the tabs you created; do not bulk-close.

## When this guide applies

Apply this guide any time the task requires Chrome DevTools — the
[`TEST.md`](./TEST.md) flow, ad-hoc browser inspection of a dev
pod, screenshotting, network capture, console inspection, etc.
If the user explicitly asks you to "use Chrome DevTools", treat
that as a trigger to run the pre-flight here **before** issuing
the first `mcp__chrome-devtools__*` call.
