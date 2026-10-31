# Action authoring rules

- This repository is only for site-specific WebHelm Actions and flow documentation; do not bundle the browser runtime.
- Run `npm test` before publishing, then verify read-only behavior in a real WebHelm Session. Confirm write-side effects before retries.
- Keep all session ownership, network CDP attachment and FIFO dispatcher concerns inside `webhelm` runtime. Use the injected browser helper API.
- Do not write secrets, profiles, ChatGPT conversation content, user files or local logs into Git.
- A modified action can be published only after review, tests and deliberate `platform publish`, which must be a fast-forward and use current repo credentials.

- For **new** platforms, use `platforms/NEW_PLATFORM.md`. Create the entire new site's manifest, `.mjs` Actions, `tests/*.test.mjs`, and README inside `$HOME/.local/webhelm/platforms/<slug>` after `npx --yes webhelm@latest setup`. Do not create them under the Skill or Runtime.
- `npm test` runs `node --test` to automatically discover new platforms' tests, without requiring edits to a central test list.
