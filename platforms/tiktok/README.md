# Tiktok Platform Actions

Canonical WebHelm Actions live here, not in the Skill or Runtime.
Use `webhelm platform profile tiktok` and `webhelm platform run --help`.

- `inspect`: Read-only signed-in account and upload-control readiness. Optional expected account guard: `expected_handle` for TikTok or `expected_channel_id` for YouTube.
- `monitor`: Read-only Studio UI; config `{"mode":"posts"}` or `{"mode":"comments"}`. Returns observed posts, comment snippets or an explicit `blocked`/`unverified` status. No scraping via credentials and no mutation. Do not interpret missing DOM rows as zero engagements.
- `post`: Legacy migrated upload action. **Not yet live E2E verified on Worknode**; requires `confirm_publish:true`, correct signed-in account, explicit visibility and destination. A click is an unverified submission, not a receipt.


Platform Actions do not verify business approvals, rights or affiliate-program requirements. Those belong to the calling project.

## Worknode read-only live verification (2026-11-02)

- `inspect` confirmed the managed Chrome account `lalalic001`, expected identity, and visible Upload control: **PASS**. This is not a video upload or publishing receipt.
- `monitor` with `mode:posts` read an existing post and its displayed views/likes/comments; `mode:comments` confirmed TikTok Studio's explicit “No comments yet” state. A nonempty comment record has **not** been live-tested.
- `post` remains unverified for live upload and must not run without `confirm_publish:true` **and** a separate owner-approved creative, channel and destination.

## Generic publication and inventory boundary

This isolated worktree is not installed, pushed or deployed. The platform `post` Action validates explicit intent, actual signed-in account, recent trusted Studio inventory and a supplied local `video_sha256` when present. It does **not** authenticate owner consent, provider licensing, any Safelist, tracking-link placement or the full private attempt ledger; the calling project must verify these first. A click only returns `submitted_unverified`.

The monitors currently sample at most 30 posts and cannot prove completeness for a nonempty inventory. No caller-supplied `coverage_complete` flag can override this. The automated Action stops before upload; see [manual full-history/draft/attempt reconciliation](../MANUAL_RECONCILIATION.md) for an audited human-only continuation and cross-node byte staging. Do not treat synthetic mock tests as a live publication E2E.
