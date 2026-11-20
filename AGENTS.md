# Action authoring rules

- This repository is only for site-specific WebHelm Actions and flow documentation; do not bundle the browser runtime.
- Run `npm test` before publishing, then verify read-only behavior in a real WebHelm Session. Confirm write-side effects before retries.
- Keep all session ownership, network CDP attachment and FIFO dispatcher concerns inside `webhelm` runtime. Use the injected browser helper API.
- Do not write secrets, profiles, ChatGPT conversation content, user files or local logs into Git.
- A modified action can be published only after review, tests and deliberate `platform publish`, which must be a fast-forward and use current repo credentials.

- For **new** platforms, use `platforms/NEW_PLATFORM.md`. Create the entire new site's manifest, `.mjs` Actions, `tests/*.test.mjs`, and README inside `$HOME/.local/webhelm/platforms/<slug>` after `npx --yes webhelm@latest setup`. Do not create them under the Skill or Runtime.
- `npm test` runs `node --test` to automatically discover new platforms' tests, without requiring edits to a central test list.

## Mandatory ChatGPT delivery MVP release gate

Every change to a ChatGPT Action, browser helper, Queue Policy, readiness gate,
manifest, or to Runtime code that changes ChatGPT delivery **MUST pass three
real browser MVPs after the final change**, before merge, push, live, or clean:
(1) `new-thread` creates a persistent Thread with an observed ID;
(2) direct `new-turn` submits into that same Thread, with one Send click;
(3) two separately queued `new-turn` Actions submit in FIFO order to that same
Thread with `validate_new_turn_ready` gating and both durable `SENT` receipts.
Verify every test-owned Session was stopped and that unrelated Sessions/tabs
were preserved. These are four deliberately authorized test messages. Execute
`WEBHELM_MVP_ALLOW_SEND=1 npm run test:e2e:chatgpt-mvps` from the WebHelm Runtime
checkout. The default live-daemon Queue route, not a Mock or manual queue
harness, MUST pass. Record the evidence file and Thread URL in the handoff.
`npm test` alone cannot satisfy this gate. Never submit old ambiguous turns or
stop another agent's Session to force a release.
