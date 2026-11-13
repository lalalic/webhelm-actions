# Creating or fixing a platform

The **only writable source** for site behavior is this Git checkout's `platforms/` directory. On a user's machine this repo is at `$HOME/.local/webhelm`; therefore a new platform's canonical path is **`$HOME/.local/webhelm/platforms/<slug>`**, never `skills/webhelm/platforms`, npm's `runtime/` directory, or the npm cache.

Start with `npx --yes webhelm@latest setup`, then `cd "$HOME/.local/webhelm"`. For an unsupported site use a slug of lowercase letters, numbers and hyphens (example: `example-site`). Create:

```text
~/.local/webhelm/platforms/example-site/
  manifest.yaml
  README.md
  actions/_inspect.mjs
  tests/inspect.test.mjs
```

Example `manifest.yaml`:

```yaml
platform: example-site
display_name: Example Site
status: unverified
last_verified: null
actions:
  inspect: actions/_inspect.mjs
```

Example `actions/_inspect.mjs`:

```js
export default async function run({ helpers }) {
  const page = await helpers.page_info();
  return { ok: true, url: page.url, title: page.title };
}
```

Add tests in the new directory; `npm test` in this checkout discovers all `*.test.mjs` files automatically, including newly added platforms. Read existing Actions and the runtime's Browser Helpers contract before writing or running other Actions. Begin with harmless read-only operations; use caller-owned Sessions for real browser E2E, and never invent successful submission receipts. Add a human-readable README explaining the site's supported flows and verification state. Do not store passwords, cookies, user content, screenshots, or browsing logs in Git.

Verify `npx --yes webhelm@latest platform list` and `platform profile example-site`, run Actions tests and a real read-only Action through an owned Session. Then publish *reviewed* changes only to `lalalic/webhelm-actions` using `npx --yes webhelm@latest platform publish --message "feat(example-site): add inspector"`. This tests, commits only under `platforms/` and uses regular non-force Git push.

## Optional durable queue integration

The default for every new Platform Action is **direct execution**. Queue handling is an optional WebHelm **Runtime** feature, not something a site Action can enable in its manifest. **Only ChatGPT asynchronous `new-turn` is queued today.**

If a future platform needs durable FIFO delivery, request a Runtime integration and follow the [WebHelm Queue Integration guide](https://github.com/lalalic/webhelm/blob/main/docs/QUEUE_INTEGRATION.md). The Runtime maintainer must provide the platform queue adapter/policy, partition and concurrency rules, optional enqueue-time merge, idempotency/recovery behavior, and routing from the Action dispatcher. `manifest.yaml` has **no queue registration field**, and `registerQueuePolicy()` is **not** an existing API. Platform Actions remain unaware of queues and execute with their normal `helpers`/`config` contract; the Extension, not a public Queue CLI, exposes queue management.

When an existing Action breaks, edit the module in `$HOME/.local/webhelm/platforms/<slug>` directly, not the installed Skill or Runtime. `platform sync` pulls published updates fast-forward only and refuses to overwrite local edits. New Actions do **not** require a WebHelm npm release or Skill reinstall.

## Optional login heartbeat (only for platforms that need it)

A platform does **not** need a heartbeat merely because its browser session is
persistent. Only implement this when the website requires periodic activity or
supports an explicit logged-in readiness check. WebHelm users enable the site
from the Extension popup on a leased HTTPS tab; the registration survives the
tab's Session release and lives with the managed Chrome profile.

If needed, add the following to `manifest.yaml` (the `url_patterns` must match
that HTTPS website's origin):

```yaml
url_patterns:
  - https://creator.example.com/*
actions:
  heartbeat: actions/_heartbeat.mjs
keep_alive:
  action: heartbeat
  interval_minutes: 30
  url: https://creator.example.com/
```

`interval_minutes` must be 5–1440. The URL must use the same HTTPS origin and
must not contain secrets, userinfo, query parameters, or fragments. This is
an **opt-in** Platform feature; do not add a generic heartbeat to every site.

Implement `actions/_heartbeat.mjs` as a **read-only** Action using existing
WebHelm `helpers`. Return one of these exact results:

- `{status:'alive'}`: authenticated state verified by a platform-specific signal
- `{status:'login_required'}`: a platform-specific login-required signal was found
- `{status:'unknown'}`: no reliable authentication evidence was available

Do not treat a successfully loaded web page as proof of login, auto-submit
credentials, bypass 2FA/CAPTCHA, expose cookie values, or perform writes just
to extend a login. The Runtime owns scheduling, timeout handling, temporary
Session cleanup, and Extension UI status. Test both signed-in and signed-out
cases in an owned browser Session before claiming live authentication verification.
