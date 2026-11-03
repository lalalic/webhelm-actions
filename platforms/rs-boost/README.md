# RS Boost / ReelShort series metadata

Use the read-only `metadata` Action when a documented, authorized RS Boost
metadata API is unavailable or unverified. This is **not** an API integration;
metadata comes from the official ReelShort series page through WebHelm.

`metadata` config:

```json
{
  "provider_url": "https://cps.reelshort.com/resource-square/detail/<series_id>",
  "official_url": "https://www.reelshort.com/movie/<slug>-<series_id>",
  "expected_title": "Official drama title"
}
```

Query via `webhelm platform run rs-boost metadata --session-id SESSION_ID --config FILE`
inside a caller-owned Session. The Action checks title and exact provider
series ID against the official page, and returns source-backed plot, episode
count and unmapped **actor names**. Actors are not automatically characters or
speaker identities. Never return referral links, cookies or private content.

Rights and licensed MP4 acquisition remain under the Content Distribution
project's existing independent permission gate. Do **not** download a public
stream or treat a public Watch/Download link as a CPS license. Original episode
files must be acquired through the licensed RS Boost Content Hub and preserved
in the canonical private Run with hash verification. This Action does not post,
upload, purchase, or download video.

If RS Boost later publishes a documented metadata API, verify its permission,
response shape and scope independently before preferring it. Do not treat
frontend network requests or an `API Information` label as a stable contract.
