# Youtube Platform Actions

Canonical WebHelm Actions live here, not in the Skill or Runtime.
Use `webhelm platform profile youtube` and `webhelm platform run --help`.

- `inspect`: Read-only signed-in account and upload-control readiness. Optional expected account guard: `expected_handle` for TikTok or `expected_channel_id` for YouTube.
- `monitor`: Read-only Studio UI; config `{"mode":"posts","content_type":"shorts"}` (default Shorts), `{"mode":"posts","content_type":"videos"}`, or `{"mode":"comments"}`. Returns observed posts, comment snippets or an explicit `blocked`/`unverified` status. No scraping via credentials and no mutation. Do not interpret missing DOM rows as zero engagements.
- `post`: Legacy migrated upload action. **Not yet live E2E verified on Worknode**; requires `confirm_publish:true`, correct signed-in account, explicit visibility and destination. A click is an unverified submission, not a receipt.


Platform Actions do not verify business approvals, rights or affiliate-program requirements. Those belong to the calling project.

## Generic publication and inventory boundary

This isolated worktree is not installed, pushed or deployed. The platform `post` Action validates explicit intent, actual signed-in account, recent trusted Studio inventory and a supplied local `video_sha256` when present. It does **not** authenticate owner consent, provider licensing, any Safelist, tracking-link placement or the full private attempt ledger; the calling project must verify these first. A click only returns `submitted_unverified`.

The monitors currently sample at most 30 posts and cannot prove completeness for a nonempty inventory. No caller-supplied `coverage_complete` flag can override this. The automated Action stops before upload; see [manual full-history/draft/attempt reconciliation](../MANUAL_RECONCILIATION.md) for an audited human-only continuation and cross-node byte staging. Do not treat synthetic mock tests as a live publication E2E.

## Login heartbeat

The optional `heartbeat` Action visits the Creator Studio home using a temporary
WebHelm Session, checks site-specific authenticated UI, and returns
`alive` / `login_required` / `unknown`. It performs no writes, credentials
refresh, or automated sign-in. Users opt in from the WebHelm Extension.
