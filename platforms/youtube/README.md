# Youtube Platform Actions

Canonical WebHelm Actions live here, not in the Skill or Runtime.
Use `webhelm platform profile youtube` and `webhelm platform run --help`.

- `inspect`: Read-only signed-in account and upload-control readiness. Optional expected account guard: `expected_handle` for TikTok or `expected_channel_id` for YouTube.
- `monitor`: Read-only Studio UI; config `{"mode":"posts"}` or `{"mode":"comments"}`. Returns observed posts, comment snippets or an explicit `blocked`/`unverified` status. No scraping via credentials and no mutation. Do not interpret missing DOM rows as zero engagements.
- `post`: Legacy migrated upload action. **Not yet live E2E verified on Worknode**; now requires `confirm_publish:true` and prior owner approval, including destination and exact creative. A click is an unverified submission, not a receipt.

Worknode readiness (2026-11-02): TikTok Studio redirects to login; YouTube Studio shows a browser error even though HTTPS shell HEAD succeeds. User must sign into Worknode's **managed Chrome** and resolve YouTube navigation before live publishing or monitoring E2E. Neo Master sign-in does not transfer.

Safelist submission does not imply permission to post. The project `neo/content-distribution/accounts.md` holds public channel identities and the RS Boost account records.
