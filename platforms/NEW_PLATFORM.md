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

Actions execute directly by default. To opt in to a durable queue, create `platforms/<slug>/queues/<queue-name>.mjs` (one Policy module per Queue). WebHelm daemon automatically discovers and watches this directory; **do not add a queue key to the manifest** or write a site-specific queue worker in Runtime.

```js
export default {
  group: action => action.thread_id,  // FIFO partition
  title: action => action.message.slice(0, 52), // Queue UI title
  action: 'new-turn',                // manifest.actions key for delivery
  validate: 'validate_new_turn_ready', // manifest.actions key, read-only readiness gate
  // Optional: url(action), merge(previous, incoming), execute(action),
  // concurrency, intervalMs.
};
```

`validate` is **another Platform Action**: return `true` only when the next queued Action can safely start, otherwise `false` to wait and check again. It does not validate the input schema, perform delivery, or confirm the previous send. Each Action performs its own input and immediate pre-send validation. The queued execution calls the same `action` module as direct execution through the ordinary Platform Runner.

Optional `merge(previous,incoming)` runs **at enqueue time** under WebHelm's durable transaction. Only the last unclaimed, unleased QUEUED or pre-send WAITING record in the same `group` is eligible, and only when both requests have `mergeable:true`. Return a merged Action config or `null` to keep separate. Preserve compatible content, attachments, idempotency and context. Claimed/SENDING/SENT/FAILED items must never merge. WebHelm persists and schedules the queue; the Policy does not own SQLite or Sessions.

The authoritative implementation contract is [Queue integration](https://github.com/lalalic/webhelm/blob/main/docs/QUEUE_INTEGRATION.md); test both the Policy and the read-only readiness Action with mocked Sessions, then verify site behavior in an owned browser Session before publishing.


### Mandatory real ChatGPT Action regression (MVP1–3)

After **every change** to a ChatGPT Action, helper, `manifest.yaml`, Queue Policy,
readiness gate or WebHelm Runner that affects delivery, run the **real Chrome**
acceptance gate on a fresh test Thread, not only `npm test` mocks:

```sh
WEBHELM_MVP_ALLOW_SEND=1 npm run test:e2e:chatgpt-mvps
```

Run this from the WebHelm **Runtime** checkout against the installed live daemon.
It sends four deliberate test prompts: MVP1 `new-thread`, MVP2 direct `new-turn`
on that Thread, then MVP3 two separate non-mergeable `new-turn` Queue items on
that **same Thread**. Both Queue items must be persisted as `SENT` in FIFO order,
with `send-clicked` receipts; all owned Sessions must be released. The gate
fails closed if the live daemon still uses a legacy queue or is offline.
The script requires explicit `WEBHELM_MVP_ALLOW_SEND=1` authorization and saves
a sanitized evidence JSON under the local temporary directory (never Git).
**No merge, push, live or clean until all three pass after the final code change.**
An optional `--isolated-manual-queue` exercises the real generic queue engine
through a live browser for diagnosis only; it does **not** count as passing the
live daemon Queue MVP3.

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
