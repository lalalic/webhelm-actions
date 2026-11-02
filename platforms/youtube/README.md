# Youtube Platform Actions

Canonical WebHelm Actions live here, not in the Skill or Runtime.
Use `webhelm platform profile youtube` and `webhelm platform run --help`.

- `inspect`: Read-only signed-in account and upload-control readiness. Optional expected account guard: `expected_handle` for TikTok or `expected_channel_id` for YouTube.
- `monitor`: Read-only Studio UI; config `{"mode":"posts","content_type":"shorts"}` (default Shorts), `{"mode":"posts","content_type":"videos"}`, or `{"mode":"comments"}`. Returns observed posts, comment snippets or an explicit `blocked`/`unverified` status. No scraping via credentials and no mutation. Do not interpret missing DOM rows as zero engagements.
- `post`: Legacy migrated upload action. **Not yet live E2E verified on Worknode**; now requires `confirm_publish:true` and prior owner approval, including destination and exact creative. A click is an unverified submission, not a receipt.


Safelist submission does not imply permission to post. The project `neo/content-distribution/accounts.md` holds public channel identities and the RS Boost account records.

## Pending review: publishing safety

This worktree is not installed or deployed. Publication requires confirm_publish, matching private owner approval and exact creative revision, current rights, approved Safelist for RS Boost, verified profile Content Promotion Link placement, correct signed-in account and unique attempt ID. The Action probes the current Studio post inventory before uploading and stops on an ambiguous list or candidate duplicate. Clicks only yield submitted_unverified receipts; manual readback is needed for an actual public post URL, ID and visibility. Approval references are self-asserted configuration and are not substitutes for independent owner evidence. No real video upload was performed.
