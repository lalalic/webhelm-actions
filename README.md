# WebHelm Actions

Site-specific WebHelm manifests and executable JS actions. The canonical local checkout is `~/.local/webhelm`, with modules under `~/.local/webhelm/platforms`.

Use `npx webhelm@latest setup` to clone and prepare this repository, `npx webhelm@latest platform sync` to pull updates, and `npx webhelm@latest platform publish --message "..."` to test, commit and push verified changes. Local modifications are never overwritten by sync.

Browser Sessions, CDP, daemon lifecycle and ChatGPT's durable SQLite FIFO dispatcher belong to the separately versioned WebHelm npm runtime. This repository owns only site behavior and its tests. Do not commit credentials, cookies, private browser profiles, or recorded user content.

## New platform support

Follow [`platforms/NEW_PLATFORM.md`](platforms/NEW_PLATFORM.md): new platform manifests, Actions, tests and flow docs all live in **`~/.local/webhelm/platforms/<slug>`**. The locally checked-out Actions repository is the source of truth; npm and the WebHelm Skill never carry platform copies. Test with `npm test` (including new platform test files), verify through a caller-owned WebHelm Session, then publish to this Git repo with `webhelm platform publish`.
