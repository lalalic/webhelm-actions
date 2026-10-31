# WebHelm Actions

Site-specific WebHelm manifests and executable JS actions. The canonical local checkout is `~/.local/webhelm`, with modules under `~/.local/webhelm/platforms`.

Use `npx webhelm@latest setup` to clone and prepare this repository, `npx webhelm@latest platform sync` to pull updates, and `npx webhelm@latest platform publish --message "..."` to test, commit and push verified changes. Local modifications are never overwritten by sync.

Browser Sessions, CDP, daemon lifecycle and ChatGPT's durable SQLite FIFO dispatcher belong to the separately versioned WebHelm npm runtime. This repository owns only site behavior and its tests. Do not commit credentials, cookies, private browser profiles, or recorded user content.
