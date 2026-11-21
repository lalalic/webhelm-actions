# X / Twitter read-only research

Runs against the existing WebHelm managed Chrome profile. No passwords, cookies,
access tokens or session IDs are exported. Never tweets, likes, follows or sends
messages.

`heartbeat` checks `/home` for account-specific navigation. In the WebHelm
extension, enable Keep Alive while a `WebHelm` workspace Session has an HTTPS
`x.com` tab open. Registered sites survive the Session and use a temporary
Session for each scheduled heartbeat (30 minutes). This does not guarantee that
X will extend the login lifetime.

`search` accepts JSON `query`, `mode` (`latest` or `top`), optional `since` and
`until` dates (`until` exclusive), `max_posts` (1-100) and `scrolls` (0-25).
It uses X's visible search UI, respects login and site errors, performs bounded
scrolling, deduplicates by tweet ID, and returns public text, timestamps and
visible engagement. X's search cards do not show quote counts; `quotes=0`
is an unverified placeholder and `quotes_verified:false` is returned. Search
results can be incomplete or vary with account personalization/rate limits.

Example, read-only:

```sh
webhelm platform run x heartbeat --auto-session
webhelm platform run x search --auto-session --config /path/to/search.json
```

`last30days` supports `--x-posts /path/to/file.json`; a separate local adapter
can translate this Action's result into the documented `last30days-x-posts/1`
envelope. Do not send account session cookies to the research engine.
